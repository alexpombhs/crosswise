import React from 'react';
import { createRoot } from 'react-dom/client';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { CrosswiseAction, crosswiseTheme } from './components.jsx';

let inventoryRoot;

export function renderCrossingRows(container, crossings, getTitle, openEvidence) {
  inventoryRoot ??= createRoot(container);
  inventoryRoot.render(
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={crosswiseTheme}>
        {crossings.map(crossing => (
          <li key={`${crossing.osmType}:${crossing.osmId}`}>
            <CrosswiseAction
              className="inventory-row"
              onClick={event => openEvidence(crossing, event.currentTarget)}
            >
              <span className={`inventory-score ${crossing.color}`}>
                <span className="visually-hidden">{crossing.demo ? 'Demo score' : 'Research score'} </span>
                {crossing.score}
              </span>
              <span className="inventory-label">
                <strong>{getTitle(crossing)}</strong>
                {crossing.features?.length > 0 && <small>{crossing.features.join(' · ')}</small>}
              </span>
            </CrosswiseAction>
          </li>
        ))}
      </ThemeProvider>
    </StyledEngineProvider>,
  );
}
