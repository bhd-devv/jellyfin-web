import DOMPurify from 'dompurify';

export function subtitleText(text) {
    const container = document.createElement('div');
    container.innerHTML = DOMPurify.sanitize(text
        .replace(/\\N/gi, ' ')
        .replace(/\{\\[^}]*\}/g, '')
        .replace(/<br\b[^>]*>/gi, ' '));
    return (container.textContent || '').replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
}

export function subtitleWords(text) {
    const normalized = subtitleText(text);
    const pattern = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g;
    const words = [];
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
        words.push({ word: match[0], offset: match.index });
    }
    return { text: normalized, words };
}

export function canLearnTrack(track) {
    return Boolean(track?.IsTextSubtitleStream
        && ['en', 'eng'].includes((track.Language || '').toLowerCase())
        && ['External', 'Embed'].includes(track.DeliveryMethod));
}
