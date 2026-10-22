import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlVideoPlayer } from './plugin';

const settings = vi.hoisted(() => ({ learningEnabled: true }));

vi.mock('scripts/settings/userSettings', () => ({
    currentSettings: {
        get: () => String(settings.learningEnabled),
        getSubtitleAppearanceSettings: () => ({ verticalPosition: '-10' })
    }
}));
vi.mock('components/layoutManager', () => ({ default: { tv: false } }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('components/htmlMediaHelper', () => ({ getSavedVolume: () => 0.5 }));
vi.mock('components/subtitlesettings/subtitleappearancehelper', () => ({ default: { applyStyles: vi.fn() } }));
vi.mock('scripts/browserDeviceProfile', () => ({ default: {}, canPlaySecondaryAudio: vi.fn() }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('components/loading/loading', () => ({ default: {} }));
vi.mock('components/itemHelper', () => ({ default: {} }));

const englishTrack = { Index: 2, IsTextSubtitleStream: true, Language: 'eng', DeliveryMethod: 'External' };
const otherTrack = { ...englishTrack, Index: 3, Language: 'ukr' };
const item = { Id: 'item', ServerId: 'server' };
let player: HtmlVideoPlayer;
let video: HTMLVideoElement;

beforeEach(async () => {
    document.body.textContent = '';
    settings.learningEnabled = true;
    player = new HtmlVideoPlayer();
    player['onTimeUpdate'] = vi.fn();
    player['fetchSubtitles'] = vi.fn(async () => ({ TrackEvents: [] }));
    const mediaElement = await player['createMediaElement']({ fullscreen: false });
    if (!mediaElement) throw new Error('The video element was not created');
    video = mediaElement;
});

afterEach(() => {
    player['destroyCustomTrack'](video);
    document.body.textContent = '';
});

describe('interactive subtitle overlay', () => {
    it('moves learning subtitles out of the video stacking context and removes them on stop', async () => {
        await player['renderSubtitlesWithCustomElement'](video, englishTrack, item, 0);
        const overlay = document.querySelector('.videoSubtitles');
        expect(overlay?.parentElement).toBe(document.body);
        expect(overlay?.classList.contains('languageLearning-overlay')).toBe(true);
        expect(video.parentElement?.querySelector('.videoSubtitles')).toBeNull();
        player['destroyCustomTrack'](video);
        expect(document.querySelector('.videoSubtitles')).toBeNull();
    });

    it('keeps ordinary subtitles inside the video container', async () => {
        settings.learningEnabled = false;
        await player['renderSubtitlesWithCustomElement'](video, englishTrack, item, 0);
        const overlay = document.querySelector('.videoSubtitles');
        expect(overlay?.parentElement).toBe(video.parentElement);
        expect(overlay?.classList.contains('languageLearning-overlay')).toBe(false);
    });

    it('restores the remaining ordinary track when the learning track is removed', async () => {
        await player['renderSubtitlesWithCustomElement'](video, englishTrack, item, 0);
        await player['renderSubtitlesWithCustomElement'](video, otherTrack, item, 1);
        const overlay = document.querySelector('.videoSubtitles');
        expect(overlay?.parentElement).toBe(document.body);
        player['destroyCustomTrack'](video, 0);
        expect(overlay?.parentElement).toBe(video.parentElement);
        expect(overlay?.classList.contains('languageLearning-overlay')).toBe(false);
        expect(overlay?.querySelector('.videoSecondarySubtitlesInner')).not.toBeNull();
        player['destroyCustomTrack'](video);
        expect(document.querySelector('.videoSubtitles')).toBeNull();
    });

    it('supports a secondary learning track and cleans it up without a primary track', async () => {
        await player['renderSubtitlesWithCustomElement'](video, otherTrack, item, 0);
        await player['renderSubtitlesWithCustomElement'](video, englishTrack, item, 1);
        player['destroyCustomTrack'](video, 0);
        expect(document.querySelector('.languageLearning-overlay')?.parentElement).toBe(document.body);
        player['destroyCustomTrack'](video);
        expect(document.querySelector('.videoSubtitles')).toBeNull();
    });
});
