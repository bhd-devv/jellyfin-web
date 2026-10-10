import type { ApiClient } from 'jellyfin-apiclient';

import globalize from 'lib/globalize';

export interface VocabularyEntry {
    Id: string;
    Word: string;
    Lemma: string;
    Translation: string;
    Explanation: string;
    PartOfSpeech: string;
    Sentence: string;
    SentenceTranslation?: string | null;
    WordOffset: number;
    ItemId: string;
    StartPositionTicks: number;
    DateCreated: string;
}

export type VocabularyClient = Pick<ApiClient, 'getUrl' | 'accessToken' | 'serverId'>;

async function request<Result>(client: VocabularyClient, path: string, method: string, signal?: AbortSignal): Promise<Result> {
    const response = await fetch(client.getUrl('LanguageLearning/Vocabulary' + path), {
        method,
        headers: { 'X-Emby-Token': client.accessToken() },
        signal
    });
    if (!response.ok) {
        const errorKeys: Record<number, string> = {
            429: 'LanguageLearningBusy',
            503: 'LanguageLearningNotConfigured'
        };
        throw new Error(globalize.translate(errorKeys[response.status] || 'LanguageLearningVocabularyError'));
    }
    if (response.status === 204) return undefined as Result;
    return response.json();
}

export function fetchVocabulary(client: VocabularyClient, startIndex: number, limit: number, searchTerm: string, signal?: AbortSignal) {
    const query = `?startIndex=${startIndex}&limit=${limit}&searchTerm=${encodeURIComponent(searchTerm)}`;
    return request<VocabularyEntry[]>(client, query, 'GET', signal);
}

export function removeVocabularyEntry(client: VocabularyClient, entryId: string) {
    return request<void>(client, '/' + encodeURIComponent(entryId), 'DELETE');
}

export function translateVocabularySentence(client: VocabularyClient, entryId: string) {
    return request<VocabularyEntry>(client, '/' + encodeURIComponent(entryId) + '/Translation', 'POST');
}
