import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useApi } from 'hooks/useApi';
import globalize from 'lib/globalize';

import { isLanguageLearningAvailable } from './availability';
import { fetchVocabulary, removeVocabularyEntry, translateVocabularySentence, type VocabularyEntry } from './vocabularyApi';
import './vocabulary.scss';

const PAGE_SIZE = 20;

function Sentence({ entry }: Readonly<{ entry: VocabularyEntry }>) {
    const { Sentence: sentence, Word: word, WordOffset: offset } = entry;
    if (offset < 0 || sentence.slice(offset, offset + word.length) !== word) return <span>{sentence}</span>;
    return <span>{sentence.slice(0, offset)}<mark>{word}</mark>{sentence.slice(offset + word.length)}</span>;
}

function timestamp(ticks: number) {
    const seconds = Math.floor(ticks / 10000000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function Vocabulary() {
    const { __legacyApiClient__: client, user } = useApi();
    const queryClient = useQueryClient();
    const [ search, setSearch ] = useState('');
    const [ searchTerm, setSearchTerm ] = useState('');
    const [ page, setPage ] = useState(0);
    const [ confirming, setConfirming ] = useState<string | null>(null);
    const [ busyId, setBusyId ] = useState<string | null>(null);
    const [ actionError, setActionError ] = useState<{ id: string; message: string } | null>(null);
    const serverId = client?.serverId();
    const userId = user?.Id;
    const queryPrefix = useMemo(() => [ 'LanguageLearning', 'Vocabulary', serverId, userId ], [ serverId, userId ]);
    const { data, error, isPending, isFetching, refetch } = useQuery({
        queryKey: [ ...queryPrefix, searchTerm, page ],
        queryFn: ({ signal }) => fetchVocabulary(client!, page * PAGE_SIZE, PAGE_SIZE + 1, searchTerm, signal),
        enabled: isLanguageLearningAvailable() && Boolean(client && user?.Id),
        retry: false,
        staleTime: 0,
        refetchOnMount: 'always'
    });
    const entries = useMemo(() => data?.slice(0, PAGE_SIZE) || [], [ data ]);
    const hasNext = (data?.length || 0) > PAGE_SIZE;

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchTerm(search.trim());
            setPage(0);
        }, 300);
        return () => clearTimeout(timer);
    }, [ search ]);

    const runAction = useCallback(async (entry: VocabularyEntry, remove: boolean) => {
        if (!client || busyId) return;
        setBusyId(entry.Id);
        setActionError(null);
        try {
            if (remove) {
                await removeVocabularyEntry(client, entry.Id);
                setConfirming(null);
                if (entries.length === 1 && page > 0) setPage(page - 1);
            } else {
                await translateVocabularySentence(client, entry.Id);
            }
            await queryClient.invalidateQueries({ queryKey: queryPrefix });
        } catch (actionException) {
            setActionError({ id: entry.Id, message: (actionException as Error).message });
        } finally {
            setBusyId(null);
        }
    }, [ busyId, client, entries.length, page, queryClient, queryPrefix ]);

    const handleSearch = useCallback((event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value), []);
    const handleRetry = useCallback(() => {
        void refetch();
    }, [ refetch ]);
    const handleConfirm = useCallback((event: React.MouseEvent<HTMLButtonElement>) => setConfirming(event.currentTarget.dataset.id || null), []);
    const handleCancel = useCallback(() => setConfirming(null), []);
    const handleAction = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        const entry = entries.find(value => value.Id === event.currentTarget.dataset.id);
        if (entry) void runAction(entry, event.currentTarget.dataset.action === 'remove');
    }, [ entries, runAction ]);
    const handlePrevious = useCallback(() => setPage(value => value - 1), []);
    const handleNext = useCallback(() => setPage(value => value + 1), []);

    return (
        <div className='vocabulary padded-left padded-right padded-bottom-page padded-top'>
            <header className='vocabulary-header'>
                <div>
                    <p className='vocabulary-eyebrow'>English → Українська</p>
                    <h1>{globalize.translate('LanguageLearningVocabulary')}</h1>
                    <p className='vocabulary-intro'>{globalize.translate('LanguageLearningVocabularyIntro')}</p>
                </div>
                <a href='#/mypreferencesplayback' className='vocabulary-settings'>
                    {globalize.translate('LanguageLearning')}
                </a>
            </header>

            <div className='vocabulary-search'>
                <label htmlFor='vocabularySearch'>{globalize.translate('LanguageLearningVocabularySearch')}</label>
                <input
                    id='vocabularySearch'
                    type='search'
                    maxLength={200}
                    value={search}
                    onChange={handleSearch}
                    placeholder={globalize.translate('LanguageLearningVocabularySearchHint')}
                />
            </div>

            <div className='vocabulary-status' role='status' aria-live='polite'>
                {(isPending || isFetching) && globalize.translate('Loading')}
                {!isFetching && entries.length > 0 && globalize.translate('LanguageLearningVocabularyRange', page * PAGE_SIZE + 1, page * PAGE_SIZE + entries.length)}
            </div>

            {error && (
                <div className='vocabulary-empty' role='alert'>
                    <p>{error.message}</p>
                    <button type='button' onClick={handleRetry}>{globalize.translate('Retry')}</button>
                </div>
            )}

            {!isPending && !error && entries.length === 0 && (
                <div className='vocabulary-empty'>
                    <span className='material-icons menu_book' aria-hidden='true' />
                    <h2>{globalize.translate(searchTerm ? 'LanguageLearningVocabularyNoResults' : 'LanguageLearningVocabularyEmpty')}</h2>
                    <p>{globalize.translate(searchTerm ? 'LanguageLearningVocabularyTrySearch' : 'LanguageLearningVocabularyEmptyHelp')}</p>
                </div>
            )}

            {!error && (
                <div className='vocabulary-grid' aria-busy={isFetching}>
                    {entries.map(entry => (
                        <article key={entry.Id} className='vocabulary-card' aria-labelledby={'word-' + entry.Id}>
                            <div className='vocabulary-cardHeader'>
                                <h2 id={'word-' + entry.Id} lang='en'>{entry.Word}</h2>
                                <span className='vocabulary-partOfSpeech' lang='en'>{entry.PartOfSpeech}</span>
                            </div>
                            <p className='vocabulary-wordTranslation' lang='uk'>{entry.Translation}</p>
                            <div className='vocabulary-context'>
                                <p className='vocabulary-label'>{globalize.translate('LanguageLearningVocabularySentence')}</p>
                                <p className='vocabulary-sentence' lang='en'><Sentence entry={entry} /></p>
                                {entry.SentenceTranslation ? (
                                    <p className='vocabulary-sentenceTranslation' lang='uk'>{entry.SentenceTranslation}</p>
                                ) : (
                                    <button type='button' disabled={Boolean(busyId)} data-id={entry.Id} onClick={handleAction}>
                                        {globalize.translate('LanguageLearningTranslateSentence')}
                                    </button>
                                )}
                            </div>
                            <details className='vocabulary-explanation'>
                                <summary>{globalize.translate('LanguageLearningVocabularyExplanation')}</summary>
                                <p><span className='vocabulary-label'>{globalize.translate('LanguageLearningVocabularyLemma')}: </span><span lang='en'>{entry.Lemma}</span></p>
                                <p lang='en'>{entry.Explanation}</p>
                            </details>
                            {actionError?.id === entry.Id && <p className='vocabulary-error' role='alert'>{actionError.message}</p>}
                            <footer className='vocabulary-footer'>
                                <a href={'#/details?id=' + encodeURIComponent(entry.ItemId)}>{globalize.translate('LanguageLearningVocabularySource')} · {timestamp(entry.StartPositionTicks)}</a>
                                <time dateTime={entry.DateCreated}>{new Date(entry.DateCreated).toLocaleDateString()}</time>
                                {confirming !== entry.Id && (
                                    <button type='button' className='vocabulary-remove' disabled={Boolean(busyId)} data-id={entry.Id} onClick={handleConfirm} aria-label={globalize.translate('LanguageLearningVocabularyRemoveWord', entry.Word)}>
                                        {globalize.translate('Delete')}
                                    </button>
                                )}
                            </footer>
                            {confirming === entry.Id && (
                                <div className='vocabulary-confirm'>
                                    <p>{globalize.translate('LanguageLearningVocabularyRemoveWord', entry.Word)}</p>
                                    <button type='button' disabled={Boolean(busyId)} data-id={entry.Id} data-action='remove' onClick={handleAction}>{globalize.translate('Delete')}</button>
                                    <button type='button' disabled={Boolean(busyId)} onClick={handleCancel}>{globalize.translate('ButtonCancel')}</button>
                                </div>
                            )}
                        </article>
                    ))}
                </div>
            )}

            {(page > 0 || hasNext) && (
                <nav className='vocabulary-pagination' aria-label={globalize.translate('LanguageLearningVocabularyPages')}>
                    <button type='button' disabled={page === 0 || isFetching} onClick={handlePrevious}>{globalize.translate('Previous')}</button>
                    <span>{globalize.translate('LanguageLearningVocabularyPage', page + 1)}</span>
                    <button type='button' disabled={!hasNext || isFetching} onClick={handleNext}>{globalize.translate('Next')}</button>
                </nav>
            )}
        </div>
    );
}
