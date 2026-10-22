import globalize from 'lib/globalize';
import 'abortcontroller-polyfill';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { subtitleWords } from './subtitleWords';
import './languageLearning.scss';

function textElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
}

function button(label, onClick, className) {
    const element = textElement('button', label, className);
    element.type = 'button';
    element.addEventListener('click', onClick);
    return element;
}

export default class LanguageLearning {
    constructor(video, item, mediaSourceId) {
        this.video = video;
        this.item = item;
        this.mediaSourceId = mediaSourceId;
    }

    render(element, cue, cueIndex, streamIndex) {
        if (element.learningCue === cue) return;
        element.learningCue = cue;
        element.classList.add('languageLearning-subtitles');
        element.textContent = '';
        const { text, words } = subtitleWords(cue.Text);
        let position = 0;
        for (const { word, offset } of words) {
            element.appendChild(document.createTextNode(text.slice(position, offset)));
            const wordButton = button(word, event => {
                event.preventDefault();
                event.stopPropagation();
                this.open({
                    ItemId: this.item.Id,
                    MediaSourceId: this.mediaSourceId,
                    SubtitleStreamIndex: streamIndex,
                    CueIndex: cueIndex,
                    WordOffset: offset,
                    Word: word
                }, wordButton);
            }, 'languageLearning-word');
            element.appendChild(wordButton);
            position = offset + word.length;
        }
        element.appendChild(document.createTextNode(text.slice(position)));
    }

    open(selection, origin) {
        const wasPlaying = this.root ? this.wasPlaying : !this.video.paused;
        this.close(false);
        this.wasPlaying = wasPlaying;
        this.origin = origin;
        this.selection = selection;
        this.level = 0;
        this.result = null;
        this.video.pause();

        this.root = textElement('div', '', 'languageLearning-backdrop');
        this.dialog = textElement('section', '', 'languageLearning-dialog');
        this.dialog.setAttribute('role', 'dialog');
        this.dialog.setAttribute('aria-modal', 'true');
        this.dialog.setAttribute('aria-label', globalize.translate('LanguageLearning'));
        const header = textElement('div', '', 'languageLearning-header');
        header.appendChild(textElement('strong', selection.Word));
        this.star = button('☆', () => this.toggleSaved(), 'languageLearning-star');
        this.star.setAttribute('aria-label', globalize.translate('LanguageLearningSave'));
        this.star.setAttribute('aria-pressed', 'false');
        header.appendChild(this.star);
        this.closeButton = button('×', () => this.close(), 'languageLearning-close');
        this.closeButton.setAttribute('aria-label', globalize.translate('ButtonClose'));
        header.appendChild(this.closeButton);
        this.dialog.appendChild(header);
        this.content = textElement('div', '', 'languageLearning-content');
        this.dialog.appendChild(this.content);
        this.status = textElement('p', '');
        this.status.setAttribute('role', 'status');
        this.dialog.appendChild(this.status);
        this.expand = button('', () => this.lookup(this.result ? this.level + 1 : 0), 'languageLearning-expand');
        this.dialog.appendChild(this.expand);
        this.root.appendChild(this.dialog);
        this.root.addEventListener('click', event => {
            event.stopPropagation();
            if (event.target === this.root) this.close();
        });
        this.root.addEventListener('dblclick', event => event.stopPropagation());
        this.keyHandler = event => this.onKeyDown(event);
        document.addEventListener('keydown', this.keyHandler, true);
        document.body.appendChild(this.root);
        this.closeButton.focus();
        this.lookup(0);
    }

    async request(path, method, body) {
        const apiClient = ServerConnections.getApiClient(this.item.ServerId);
        const response = await fetch(apiClient.getUrl('LanguageLearning/' + path), {
            method,
            headers: {
                'X-Emby-Token': apiClient.accessToken(),
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: this.abort.signal
        });
        if (!response.ok) {
            const errorKeys = {
                503: 'LanguageLearningNotConfigured',
                429: 'LanguageLearningBusy',
                400: 'LanguageLearningUnavailableTrack'
            };
            const key = errorKeys[response.status] || 'LanguageLearningError';
            throw new Error(globalize.translate(key));
        }
        return response.status === 204 ? null : response.json();
    }

    async lookup(level) {
        this.abort?.abort();
        const abort = new AbortController();
        this.abort = abort;
        this.setBusy(true);
        this.status.textContent = globalize.translate('Loading');
        try {
            const result = await this.request('Lookup', 'POST', { ...this.selection, Level: level });
            if (abort.signal.aborted) return;
            this.result = result;
            this.level = level;
            this.renderResult();
            this.status.textContent = level === 2 && !result.PreviousSentences.length ?
                globalize.translate('LanguageLearningNoPreviousSentences') : '';
            if (result.IsSaved && level > 0) {
                await this.request('Vocabulary', 'POST', { LookupId: result.LookupId });
            }
        } catch (error) {
            if (!abort.signal.aborted) this.status.textContent = error.message;
        } finally {
            if (!abort.signal.aborted && this.root) this.setBusy(false);
        }
    }

    renderResult() {
        const result = this.result;
        this.content.textContent = '';
        this.content.appendChild(textElement('p', result.Translation, 'languageLearning-translation'));
        this.content.appendChild(textElement('p', `${result.Lemma} · ${result.PartOfSpeech}`, 'languageLearning-partOfSpeech'));
        const explanation = textElement('p', result.Explanation);
        explanation.lang = 'en';
        this.content.appendChild(explanation);
        if (result.SentenceTranslation) {
            const sentence = textElement('p', '', 'languageLearning-sentence');
            sentence.lang = 'en';
            sentence.appendChild(document.createTextNode(result.Sentence.slice(0, result.WordOffset)));
            sentence.appendChild(textElement('mark', result.Sentence.slice(result.WordOffset, result.WordOffset + result.Word.length)));
            sentence.appendChild(document.createTextNode(result.Sentence.slice(result.WordOffset + result.Word.length)));
            this.content.appendChild(sentence);
            this.content.appendChild(textElement('p', result.SentenceTranslation));
        }
        for (const previous of result.PreviousSentences) {
            const original = textElement('p', previous.Text, 'languageLearning-sentence');
            original.lang = 'en';
            this.content.appendChild(original);
            this.content.appendChild(textElement('p', previous.Translation));
        }
        this.updateStar();
    }

    updateStar() {
        const saved = Boolean(this.result?.IsSaved);
        this.star.textContent = saved ? '★' : '☆';
        this.star.setAttribute('aria-pressed', String(saved));
        this.star.setAttribute('aria-label', globalize.translate(saved ? 'LanguageLearningRemove' : 'LanguageLearningSave'));
    }

    setBusy(busy) {
        this.dialog.setAttribute('aria-busy', String(busy));
        this.star.disabled = busy || !this.result;
        this.expand.disabled = busy;
        this.expand.hidden = Boolean(this.result && this.level >= 2);
        let label = 'Retry';
        if (this.result) {
            label = this.level === 0 ? 'LanguageLearningTranslateSentence' : 'LanguageLearningMoreContext';
        }
        this.expand.textContent = globalize.translate(label);
    }

    async toggleSaved() {
        this.abort = new AbortController();
        const abort = this.abort;
        this.setBusy(true);
        try {
            if (this.result.IsSaved) {
                await this.request('Vocabulary/' + this.result.VocabularyId, 'DELETE');
            } else {
                await this.request('Vocabulary', 'POST', { LookupId: this.result.LookupId });
            }
            if (abort.signal.aborted) return;
            this.result.IsSaved = !this.result.IsSaved;
            this.updateStar();
            this.status.textContent = globalize.translate(this.result.IsSaved ? 'LanguageLearningSaved' : 'LanguageLearningRemoved');
        } catch (error) {
            if (!abort.signal.aborted) this.status.textContent = error.message;
        } finally {
            if (!abort.signal.aborted && this.root) this.setBusy(false);
        }
    }

    onKeyDown(event) {
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
        } else if (event.key === 'Tab') {
            const buttons = Array.from(this.dialog.querySelectorAll('button')).filter(element => !element.disabled && !element.hidden);
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    close(resume = true) {
        this.abort?.abort();
        if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler, true);
        this.root?.remove();
        this.root = null;
        if (resume) {
            if (this.origin?.isConnected) this.origin.focus();
            if (this.wasPlaying && this.video.paused && this.video.isConnected) {
                this.video.play().catch(error => console.debug('Unable to resume language learning playback', error));
            }
        }
        this.wasPlaying = false;
    }
}
