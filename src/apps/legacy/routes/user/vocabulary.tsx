import React from 'react';
import { Navigate } from 'react-router-dom';

import { isLanguageLearningAvailable } from 'components/languageLearning/availability';
import Vocabulary from 'components/languageLearning/Vocabulary';
import Page from 'components/Page';
import globalize from 'lib/globalize';

export default function VocabularyPage() {
    if (!isLanguageLearningAvailable()) return <Navigate to='/home' replace />;

    return (
        <Page
            id='vocabularyPage'
            title={globalize.translate('LanguageLearningVocabulary')}
            className='libraryPage noSecondaryNavPage mainAnimatedPage'
            isMenuButtonEnabled
        >
            <Vocabulary />
        </Page>
    );
}
