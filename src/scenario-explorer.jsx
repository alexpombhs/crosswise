import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { CrosswiseAction, CrosswiseCheckbox, crosswiseTheme } from './components.jsx';
import { figmaIcon } from './assets.js';

const scoreStepMs = 34;

const treatments = [
  { id: 'lighting', name: 'Improve crossing lighting', detail: 'Nighttime visibility', demoPoints: 4 },
  { id: 'refuge', name: 'Add pedestrian refuge', detail: 'Shorter crossing stages', demoPoints: 7 },
  { id: 'signal', name: 'Review signal treatment', detail: 'Engineering feasibility required', demoPoints: 5 },
];

function ScenarioExplorer({ crossing, title, onBack }) {
  const [selected, setSelected] = useState([]);
  const [displayedScore, setDisplayedScore] = useState(crossing.score);
  const [hasInteracted, setHasInteracted] = useState(false);
  const selectedTreatments = treatments.filter(treatment => selected.includes(treatment.id));
  const points = selectedTreatments.reduce((total, treatment) => total + treatment.demoPoints, 0);
  const targetScore = Math.min(100, crossing.score + points);
  const heading = useRef(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (displayedScore === targetScore) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayedScore(targetScore);
      return;
    }
    const nextScore = displayedScore + Math.sign(targetScore - displayedScore);
    const timer = window.setTimeout(() => setDisplayedScore(nextScore), scoreStepMs);
    return () => window.clearTimeout(timer);
  }, [displayedScore, targetScore]);

  function toggle(id, checked) {
    setSelected(current => checked ? [...current, id] : current.filter(value => value !== id));
    setHasInteracted(true);
  }

  return (
    <>
      <CrosswiseAction type="button" className="evidence-back" onClick={onBack} aria-label="Back to crossing evidence">
        <img src={figmaIcon('back')} alt="" /> Back
      </CrosswiseAction>
      <p className="evidence-label">Scenario explorer</p>
      <h1 id="scenario-heading" ref={heading} tabIndex={-1}>What could change?</h1>
      <p className="evidence-intro">Explore possible interventions and their illustrative scores.</p>
      <div className="evidence-card scenario-crossing">
        <span>Selected crossing</span>
        <strong>{title}</strong>
      </div>
      <section className="evidence-card" aria-labelledby="scenario-score-label">
        <h2 className="evidence-label" id="scenario-score-label">Hypothetical crossing score</h2>
        <div className="scenario-values">
          <strong aria-label={`Starting ${crossing.demo ? 'demo ' : ''}score ${crossing.score}`}>{crossing.score}</strong>
          <span aria-hidden="true">→</span>
          <strong id="scenario-result" aria-label={hasInteracted ? `Hypothetical score ${targetScore}` : 'No hypothetical result yet'}>{hasInteracted ? displayedScore : '—'}</strong>
        </div>
        <p className="scenario-result-note" role="status">
          {selected.length
            ? `Illustrative change: +${targetScore - crossing.score} points, to ${targetScore}.`
            : 'Select treatments to compare hypothetical effects.'}
        </p>
      </section>
      <h2 className="evidence-label" id="scenario-options-label">Explore infrastructure options</h2>
      <fieldset className="evidence-card scenario-options" aria-labelledby="scenario-options-label">
        {treatments.map(treatment => (
          <label key={treatment.id} className="scenario-option">
            <CrosswiseCheckbox checked={selected.includes(treatment.id)} onChange={event => toggle(treatment.id, event.target.checked)} />
            <span><strong>{treatment.name}</strong><small>{treatment.detail}</small></span>
          </label>
        ))}
      </fieldset>
      <p className="scenario-note">The point changes are demonstration assumptions. They do not estimate local crash risk or the effects of construction.</p>
    </>
  );
}

let scenarioRoot;
let visit = 0;
export function renderScenarioExplorer(container, crossing, title, onBack) {
  scenarioRoot ??= createRoot(container);
  scenarioRoot.render(
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={crosswiseTheme}>
        <ScenarioExplorer key={++visit} crossing={crossing} title={title} onBack={onBack} />
      </ThemeProvider>
    </StyledEngineProvider>,
  );
}
