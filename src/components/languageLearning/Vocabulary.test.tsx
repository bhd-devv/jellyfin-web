import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import layoutManager from 'components/layoutManager';
import Vocabulary from './Vocabulary';
import type { VocabularyEntry } from './vocabularyApi';

vi.mock('components/layoutManager', () => ({ default: { tv: false } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('hooks/useApi', () => ({
    useApi: () => ({
        __legacyApiClient__: { getUrl: (path: string) => '/' + path, accessToken: () => 'token', serverId: () => 'server' },
        user: { Id: 'user' }
    })
}));

const entry: VocabularyEntry = {
    Id: 'word-id', Word: 'figure', Lemma: 'figure out', Translation: 'зрозуміти',
    Explanation: 'Here, figure out means to understand something.', PartOfSpeech: 'verb',
    Sentence: "I couldn't figure out what she meant.", WordOffset: 11,
    SentenceTranslation: 'Я не міг зрозуміти, що вона мала на увазі.',
    ItemId: 'video-id', StartPositionTicks: 650000000, DateCreated: '2026-10-10T12:00:00Z'
};
let root: Root;
let client: QueryClient;
let container: HTMLDivElement;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    notifyManager.setScheduler(callback => {
        void Promise.resolve().then(() => act(callback));
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [ entry ] })));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    notifyManager.setScheduler(callback => setTimeout(callback, 0));
    container.remove();
    layoutManager.tv = false;
    vi.unstubAllGlobals();
});

async function renderVocabulary() {
    await act(async () => root.render(<QueryClientProvider client={client}><Vocabulary /></QueryClientProvider>));
    await vi.waitFor(async () => {
        await act(async () => {
            await Promise.resolve();
        });
        expect(container.querySelector('.vocabulary-card')).not.toBeNull();
    });
}

async function click(selector: string) {
    await act(async () => {
        (container.querySelector(selector) as HTMLElement).click();
        await new Promise(resolve => setTimeout(resolve, 0));
    });
}

describe('personal vocabulary', () => {
    it('shows the saved context, exact word occurrence, translation and explanation', async () => {
        await renderVocabulary();
        expect(container.querySelector('mark')?.textContent).toBe('figure');
        expect(container.querySelector('.vocabulary-sentence')?.textContent).toBe(entry.Sentence);
        expect(container.textContent).toContain(entry.SentenceTranslation);
        expect(container.querySelector('details')?.textContent).toContain(entry.Explanation);
        expect(container.querySelector('details')?.textContent).toContain(entry.Lemma);
        expect(container.querySelector('.vocabulary-partOfSpeech')?.textContent).toBe('verb');
        expect(container.querySelector('.vocabulary-footer a')?.getAttribute('href')).toBe('#/details?id=video-id');
        expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { 'X-Emby-Token': 'token' } }));
    });

    it('debounces search and paginates on the server', async () => {
        vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => Array.from({ length: 21 }, (_, index) => ({ ...entry, Id: String(index) })) } as Response));
        await renderVocabulary();
        expect(container.querySelectorAll('.vocabulary-card')).toHaveLength(20);
        await click('.vocabulary-pagination button:last-child');
        expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('startIndex=20'), expect.any(Object));
        await act(async () => {
            const input = container.querySelector('input')!;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'зрозуміти & figure');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 350));
        });
        await vi.waitFor(async () => {
            await act(async () => {
                await Promise.resolve();
            });
            expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('startIndex=0&limit=21&searchTerm=' + encodeURIComponent('зрозуміти & figure')), expect.any(Object));
        });
    });

    it('requires confirmation before deleting and refreshes the vocabulary', async () => {
        let removed = false;
        vi.mocked(fetch).mockImplementation(async (_url, options) => {
            if (options?.method === 'DELETE') {
                removed = true;
                return { ok: true, status: 204 } as Response;
            }
            return { ok: true, status: 200, json: async () => removed ? [] : [ entry ] } as Response;
        });
        await renderVocabulary();
        await click('.vocabulary-remove');
        expect(removed).toBe(false);
        await click('.vocabulary-confirm button:last-child');
        expect(container.querySelector('.vocabulary-confirm')).toBeNull();
        await click('.vocabulary-remove');
        await click('.vocabulary-confirm button:first-of-type');
        await vi.waitFor(async () => {
            await act(async () => {
                await Promise.resolve();
            });
            expect(container.textContent).toContain('LanguageLearningVocabularyEmpty');
        });
        expect(removed).toBe(true);
    });

    it('backfills a legacy sentence translation and keeps errors retryable', async () => {
        let translated = false;
        let failed = false;
        vi.mocked(fetch).mockImplementation(async (_url, options) => {
            if (options?.method === 'POST') {
                if (!failed) {
                    failed = true;
                    return { ok: false, status: 503 } as Response;
                }
                translated = true;
                return { ok: true, status: 200, json: async () => entry } as Response;
            }
            return { ok: true, status: 200, json: async () => [ { ...entry, SentenceTranslation: translated ? entry.SentenceTranslation : null } ] } as Response;
        });
        await renderVocabulary();
        await click('.vocabulary-context button');
        expect(container.querySelector('[role="alert"]')?.textContent).toBe('LanguageLearningNotConfigured');
        await click('.vocabulary-context button');
        await vi.waitFor(async () => {
            await act(async () => {
                await Promise.resolve();
            });
            expect(container.querySelector('.vocabulary-sentenceTranslation')?.textContent).toBe(entry.SentenceTranslation);
        });
    });

    it('does not request personal vocabulary on TV', async () => {
        layoutManager.tv = true;
        await act(async () => root.render(<QueryClientProvider client={client}><Vocabulary /></QueryClientProvider>));
        expect(fetch).not.toHaveBeenCalled();
    });
});
