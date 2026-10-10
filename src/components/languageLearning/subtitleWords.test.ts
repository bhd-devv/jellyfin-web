import { describe, expect, it } from 'vitest';
import { canLearnTrack, subtitleText, subtitleWords } from './subtitleWords';

describe('learning subtitle words', () => {
    it('normalizes formatting like the server', () => {
        expect(subtitleText('{\\an8}<i>Hello</i>\\Nworld &amp; friends!')).toBe('Hello world & friends!');
        expect(subtitleText("<b>can't</b><br />go")).toBe("can't go");
    });

    it('preserves occurrences, contractions and hyphenated words', () => {
        expect(subtitleWords("Go, go! I can't re-enter.")).toEqual({
            text: "Go, go! I can't re-enter.",
            words: [
                { word: 'Go', offset: 0 },
                { word: 'go', offset: 4 },
                { word: 'I', offset: 8 },
                { word: "can't", offset: 10 },
                { word: 're-enter', offset: 16 }
            ]
        });
    });

    it('only enables English text tracks delivered outside the video', () => {
        expect(canLearnTrack({ IsTextSubtitleStream: true, Language: 'eng', DeliveryMethod: 'External' })).toBe(true);
        expect(canLearnTrack({ IsTextSubtitleStream: false, Language: 'eng', DeliveryMethod: 'External' })).toBe(false);
        expect(canLearnTrack({ IsTextSubtitleStream: true, Language: 'ukr', DeliveryMethod: 'External' })).toBe(false);
        expect(canLearnTrack({ IsTextSubtitleStream: true, Language: 'eng', DeliveryMethod: 'Encode' })).toBe(false);
    });
});
