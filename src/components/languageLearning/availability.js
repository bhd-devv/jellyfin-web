import layoutManager from 'components/layoutManager';

export function isLanguageLearningAvailable() {
    return !layoutManager.tv;
}

export function isLanguageLearningEnabled(settings) {
    return isLanguageLearningAvailable() && settings.get('languageLearningEnabled') === 'true';
}
