import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { loadLocalState, saveStateToStorage } from './state.js';
import { setupStepDialModal } from './dial.js';

document.addEventListener('DOMContentLoaded', () => {
  let state = loadLocalState();

  // Uuendatud sisselogimise tekst liugmenüüs ("Registreeru või logi sisse")
  const googleAuthText = document.getElementById('googleAuthText');
  if (googleAuthText) {
    googleAuthText.textContent = state.profile.email ? `Logi välja (${state.profile.email})` : 'Registreeru või logi sisse';
  }

  function updateHudUI() {
    const steps = state.today.steps || 0;
    const goal = state.settings.stepGoal || 10000;
    const missing = Math.max(0, goal - steps);
    const pct = Math.min(100, Math.round((steps / goal) * 100));

    document.getElementById('liveSteps').textContent = steps.toLocaleString('et-EE');
    document.getElementById('goalStepsLabel').textContent = goal.toLocaleString('et-EE');
    document.getElementById('stepPercentText').textContent = `${pct}%`;
    document.getElementById('stepRingProgress').style.strokeDashoffset = 263.89 - (pct / 100) * 263.89;

    document.getElementById('liveDistance').textContent = (state.today.distanceKm || 0).toFixed(2);
    document.getElementById('liveCalories').textContent = state.today.calories || 0;
  }

  setupStepDialModal(() => state, (shouldRoute) => {
    saveStateToStorage(state);
    updateHudUI();
    if (shouldRoute) {
      const missing = Math.max(0, state.settings.stepGoal - state.today.steps);
      alert(`Salvestatud! Genereerin kaardile ${missing > 0 ? missing : 3000} sammu pikkuse ringi.`);
    }
  });

  updateHudUI();
});
