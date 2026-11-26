import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { CrosswiseAction, CrosswiseAddressInput, CrosswiseButton, CrosswiseIconButton, crosswiseTheme } from './components.jsx';

import { figmaIcon } from './assets.js';

function App() {
  return (
    <>
      <div className="app" data-view="planner">
        <header className="app-header">
          <div className="brand"><span className="logo"><img src={figmaIcon("brand")} alt="" /></span><div><b>crosswise</b><small>PEDESTRIAN RISK RESEARCH</small></div></div>
          <CrosswiseIconButton type="button"  id="info" aria-label="About Crosswise"><img src={figmaIcon("info")} alt="" /></CrosswiseIconButton>
        </header>
        <main className="workspace">
          <section className="planner" aria-labelledby="planner-heading">
            <p className="planner-label">Plan walking directions</p>
            <h1 id="planner-heading">Where are you going?</h1>
            <div className="directions-fields">
              <span className="endpoint-marker start-marker" aria-hidden="true"></span>
              <div className="address-field start-field">
                <div className="point-input">
                  <CrosswiseAddressInput id="from" label="Starting point" placeholder="Choose starting point" />
                  <CrosswiseIconButton type="button" id="clear-from" className="icon-button--clear" aria-label="Clear starting point" tooltip="Clear starting point">×</CrosswiseIconButton>
                  <CrosswiseIconButton type="button" id="gps" className="icon-button--location" aria-label="Use my location" tooltip="Use my location"><span className="location-icon" aria-hidden="true"></span></CrosswiseIconButton>
      
                </div>
                <ul id="from-suggestions" className="address-suggestions" role="listbox" aria-label="Starting point suggestions" hidden></ul>
                <span id="from-lookup-status" className="address-status" role="status"></span>
              </div>
              <span className="endpoint-marker destination-marker" aria-hidden="true"></span>
              <div className="address-field destination-field">
                <div className="point-input">
                  <CrosswiseAddressInput id="to" label="Destination" placeholder="Choose destination…" />
                  <CrosswiseIconButton type="button" id="clear-to" className="icon-button--clear" aria-label="Clear destination" tooltip="Clear destination">×</CrosswiseIconButton>
                </div>
                <ul id="to-suggestions" className="address-suggestions" role="listbox" aria-label="Destination suggestions" hidden></ul>
                <span id="to-lookup-status" className="address-status" role="status"></span>
              </div>
              <CrosswiseIconButton type="button" id="swap" className="swap-addresses" aria-label="Swap starting point and destination" title="Swap addresses">⇅</CrosswiseIconButton>
            </div>
            <CrosswiseButton type="button" className="primary" id="find"><span id="find-label">Find walking route</span></CrosswiseButton>
          </section>
          <div className="map-area">
            <div id="map" aria-label="Geographic map of Bedford, Massachusetts"><div id="map-loader">Loading street map…</div></div>
            <div className="zoom-controls"><CrosswiseIconButton id="locate" aria-label="Recenter on location">⌖</CrosswiseIconButton><CrosswiseIconButton id="zoom-in" aria-label="Zoom in">+</CrosswiseIconButton><CrosswiseIconButton id="zoom-out" aria-label="Zoom out">−</CrosswiseIconButton></div>
            <section className="route-top" aria-label="Walking navigation" hidden>
              <CrosswiseAction type="button" className="destination" id="back" aria-label="Back to route planner"><img src={figmaIcon("back")} alt="" /><span><strong id="route-destination"></strong><small id="route-estimate"></small></span></CrosswiseAction>
              <CrosswiseAction type="button" className="maneuver" id="next-step"><img src={figmaIcon("straight")} alt="" /><span><strong id="maneuver-text"></strong><small>Walking directions</small></span></CrosswiseAction>
            </section>
            <span id="map-demo-label" className="demo-map-label" hidden>Demo crossing scores</span>
            <section className="results panel" aria-label="Route details" hidden>
              <CrosswiseAction type="button" id="route-score" className="route-score" aria-label="Open route crossing score" aria-controls="score-sheet" aria-expanded="false"><small id="route-score-label">SCORE</small><span><strong id="overall">—</strong><img src={figmaIcon("score")} alt="" /></span></CrosswiseAction>
              <div className="route-sheet">
                <div className="handle" aria-hidden="true"></div>
                <div className="travel"><strong><span id="minutes">—</span> min</strong><b id="distance">—</b><span><span id="count">—</span> crossings</span></div>
                <div className="route-actions"><CrosswiseButton type="button" id="show-steps" aria-controls="steps-details" aria-expanded="false" variant="outlined">Steps</CrosswiseButton><CrosswiseButton type="button" id="compare-routes" aria-controls="comparison-sheet" aria-expanded="false">Compare routes</CrosswiseButton></div>
              </div>
              <section className="route-sheet score-sheet" id="score-sheet" aria-labelledby="score-heading" hidden>
                <div className="handle" aria-hidden="true"></div>
                <h2 id="score-heading" tabIndex={-1}>Route crossing score</h2>
                <div className="score-sheet-average"><strong id="score-sheet-value">—</strong><span>/ 100</span></div>
                <p id="score-sheet-summary"></p>
                <h3>Crossings on this route</h3>
                <ol id="route-crossing-inventory" role="list"></ol>
              </section>
              <section className="route-sheet comparison-sheet" id="comparison-sheet" aria-labelledby="comparison-heading" hidden>
                <div className="handle" aria-hidden="true"></div>
                <div className="steps-title">
                  <h2 id="comparison-heading" tabIndex={-1}>Walking routes</h2>
                </div>
                <p id="comparison-demo-label" className="comparison-demo-label" hidden>Demo scores use simulated values and do not measure crossing safety.</p>
                <p id="comparison-status" role="status" hidden></p>
                <div className="comparison-options">
                  {[0, 1, 2].map(index => (
                    <CrosswiseAction key={index} type="button" id={`route-option-${index}`} className="route-option" aria-pressed="false" hidden>
                      <span className="option-score"></span>
                      <span className="option-text"><strong></strong><small></small><small className="option-demo" hidden>Demo score</small></span>
                      <span className="option-selected">Selected</span>
                    </CrosswiseAction>
                  ))}
                </div>
              </section>
              <section className="route-sheet steps-sheet" id="steps-details" aria-labelledby="steps-heading" hidden>
                <div className="steps-header">
                  <div className="handle" aria-hidden="true"></div>
                  <div className="steps-title">
                    <h2 id="steps-heading" tabIndex={-1}>Walking directions</h2>
                  </div>
                </div>
                <ol id="directions" role="list"></ol>
              </section>
            </section>
          </div>
          <section id="crossing-evidence" className="evidence-page" aria-labelledby="evidence-title" hidden>
            <CrosswiseAction type="button" id="evidence-back" className="evidence-back" aria-label="Back to previous view">
              <img src={figmaIcon("back")} alt="" /> Back
            </CrosswiseAction>
            <p className="evidence-label">Crosswalk evidence</p>
            <h1 id="evidence-title" tabIndex={-1}></h1>
            <p className="evidence-intro">Crossing characteristics and supporting data</p>
            <section className="evidence-card evidence-score-card" aria-labelledby="evidence-score-label">
              <h2 className="evidence-label" id="evidence-score-label">Crosswalk score</h2>
              <div className="evidence-value"><strong id="evidence-score"></strong><span>/ 100</span></div>
              <div className="evidence-meter" id="evidence-meter" aria-hidden="true"><span></span></div>
              <p id="evidence-score-note"></p>
            </section>
            <CrosswiseButton type="button" id="simulate-crossing" className="primary evidence-simulate">Simulate</CrosswiseButton>
            <h2 className="evidence-label">Mapped crossing details</h2>
            <dl className="evidence-card evidence-facts">
              <div><dt>Road geometry</dt><dd id="evidence-road"></dd></div>
              <div><dt>Traffic exposure</dt><dd>No traffic counts linked</dd></div>
              <div><dt>Protection features</dt><dd id="evidence-protection"></dd></div>
            </dl>
            <h2 className="evidence-label">Data coverage</h2>
            <section className="evidence-card evidence-coverage">
              <strong>No historic crash records linked to this crossing</strong>
              <p>Site-specific yielding, current lighting, and exact crossing conditions remain unverified.</p>
              <a id="evidence-source" target="_blank" rel="noopener noreferrer">View crossing in OpenStreetMap</a>
            </section>
          </section>
          <section id="scenario-explorer" className="evidence-page scenario-page" aria-labelledby="scenario-heading" hidden></section>
          <p id="status" role="status" aria-live="polite"></p>
        </main>
        <nav className="bottom-nav" aria-label="Main navigation">
          <CrosswiseAction type="button" id="nav-map" aria-current="page"><span className="nav-icon"><img src={figmaIcon("map-active")} alt="" /></span><span className="nav-label">Map</span></CrosswiseAction>
          <CrosswiseAction type="button" id="nav-routes"><span className="nav-icon"><img src={figmaIcon("routes")} alt="" /></span><span className="nav-label">Routes</span></CrosswiseAction>
          <CrosswiseAction type="button" id="nav-simulate" aria-disabled="true" title="Open a crossing to simulate treatments"><span className="nav-icon"><img src={figmaIcon("simulate")} alt="" /></span><span className="nav-label">Simulate</span></CrosswiseAction>
          <CrosswiseAction type="button" id="nav-sources"><span className="nav-icon"><img src={figmaIcon("sources")} alt="" /></span><span className="nav-label">Sources</span></CrosswiseAction>
        </nav>
      </div>
      <dialog id="sources-dialog">
        <h2>Crosswise research sources</h2>
        <p>Basemap by <a href="https://openfreemap.org/">OpenFreeMap</a> and <a href="https://openmaptiles.org/">OpenMapTiles</a>, using <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>.</p>
        <p>Walking directions use Valhalla. Crossings come from OpenStreetMap and Bedford addresses come from MassGIS.</p>
        <p>Demo scores are simulated values for trying the interface. Reviewed scores are exploratory research estimates. A geometric match does not confirm that your route traverses a crossing.</p>
        <form method="dialog"><CrosswiseButton className="primary" type="submit">Close</CrosswiseButton></form>
      </dialog>
    </>
  );
}

const root = createRoot(document.getElementById('app-root'));
flushSync(() => root.render(
  <StyledEngineProvider injectFirst>
    <ThemeProvider theme={crosswiseTheme}>
      <App />
    </ThemeProvider>
  </StyledEngineProvider>,
));
void import('./main.js');
