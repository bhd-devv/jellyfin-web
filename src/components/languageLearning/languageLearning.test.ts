import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LanguageLearning from './languageLearning';

vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: { getApiClient: () => ({ getUrl: (path: string) => '/' + path, accessToken: () => 'test-token' }) }
}));

const selection = { ItemId: 'item', MediaSourceId: 'source', SubtitleStreamIndex: 2, CueIndex: 0, WordOffset: 0, Word: 'Go' };
const response = {
    LookupId: 'lookup', VocabularyId: 'entry', IsSaved: false,
    Word: 'Go', Lemma: 'go', Translation: 'Іди', Explanation: 'Move away.', PartOfSpeech: 'verb',
    Sentence: 'Go now.', WordOffset: 0, SentenceTranslation: null, PreviousSentences: []
};
let learning: LanguageLearning;
let video: HTMLVideoElement;
let paused: boolean;

beforeEach(() => {
    document.body.textContent = '';
    video = document.createElement('video');
    document.body.appendChild(video);
    paused = false;
    Object.defineProperty(video, 'paused', { get: () => paused });
    video.pause = vi.fn(() => {
        paused = true;
    });
    video.play = vi.fn(() => {
        paused = false;
        return Promise.resolve();
    });
    learning = new LanguageLearning(video, { Id: 'item', ServerId: 'server' }, 'source');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...response }) })));
});

afterEach(() => {
    learning.close(false);
    vi.unstubAllGlobals();
});

describe('language learning dialog', () => {
    it('pauses and expands incrementally while preserving the selected occurrence', async () => {
        learning.open(selection, video);
        await vi.waitFor(() => expect(learning.result).not.toBeNull());
        expect(video.pause).toHaveBeenCalledOnce();
        expect(learning.content.textContent).toContain('Іди');
        expect(learning.content.textContent).not.toContain('Go now.');
        await learning.lookup(1);
        await learning.lookup(2);
        const bodies = vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(options!.body as string));
        expect(bodies.map(body => body.Level)).toEqual([0, 1, 2]);
        expect(bodies.every(body => body.CueIndex === 0 && body.WordOffset === 0)).toBe(true);
        learning.close();
        expect(video.play).toHaveBeenCalledOnce();
    });

    it('keeps an already paused video paused and discards a late result after closing', async () => {
        paused = true;
        let complete: (value: Response) => void;
        vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => {
            complete = resolve;
        }));
        learning.open(selection, video);
        learning.close();
        complete!({ ok: true, status: 200, json: async () => response } as Response);
        await Promise.resolve();
        expect(learning.root).toBeNull();
        expect(video.play).not.toHaveBeenCalled();
    });

    it('saves the verified lookup and removes the saved entry', async () => {
        learning.open(selection, video);
        await vi.waitFor(() => expect(learning.result).not.toBeNull());
        await learning.toggleSaved();
        expect(learning.star.getAttribute('aria-pressed')).toBe('true');
        expect(fetch).toHaveBeenLastCalledWith('/LanguageLearning/Vocabulary', expect.objectContaining({ method: 'POST', body: JSON.stringify({ LookupId: 'lookup' }) }));
        await learning.toggleSaved();
        expect(fetch).toHaveBeenLastCalledWith('/LanguageLearning/Vocabulary/entry', expect.objectContaining({ method: 'DELETE' }));
        expect(learning.star.getAttribute('aria-pressed')).toBe('false');
    });

    it('shows errors and allows retry without resuming playback', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
        learning.open(selection, video);
        await vi.waitFor(() => expect(learning.status.textContent).toBe('LanguageLearningNotConfigured'));
        expect(learning.expand.disabled).toBe(false);
        expect(learning.star.disabled).toBe(true);
        expect(video.play).not.toHaveBeenCalled();
        await learning.lookup(0);
        expect(learning.content.textContent).toContain('Іди');
    });

    it('renders model output as text and traps Escape inside the modal', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...response, Explanation: '<img src=x onerror=alert(1)>' }) } as Response);
        learning.open(selection, video);
        await vi.waitFor(() => expect(learning.result).not.toBeNull());
        expect(learning.content.querySelector('img')).toBeNull();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
});
