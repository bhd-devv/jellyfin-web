import { afterEach, describe, expect, it, vi } from 'vitest';
import layoutManager from 'components/layoutManager';
import { isLanguageLearningAvailable, isLanguageLearningEnabled } from './availability';

vi.mock('components/layoutManager', () => ({ default: { tv: false } }));

afterEach(() => {
    layoutManager.tv = false;
});

describe('language learning availability', () => {
    it('enables learning in the browser only when the preference is enabled', () => {
        expect(isLanguageLearningAvailable()).toBe(true);
        expect(isLanguageLearningEnabled({ get: () => 'true' })).toBe(true);
        expect(isLanguageLearningEnabled({ get: () => 'false' })).toBe(false);
    });

    it('ignores an enabled account preference in TV layout', () => {
        layoutManager.tv = true;
        expect(isLanguageLearningAvailable()).toBe(false);
        expect(isLanguageLearningEnabled({ get: () => 'true' })).toBe(false);
    });
});
