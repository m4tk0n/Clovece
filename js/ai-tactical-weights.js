// Kompatibilní název souboru pro starší odkazy; aktivní AI používá deset vah.
import { getAIStrategicWeights } from './ai-weight-config.js';
export const AI_TACTICAL_WEIGHTS = Object.freeze(getAIStrategicWeights());
