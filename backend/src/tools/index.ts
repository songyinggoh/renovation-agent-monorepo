import { getStyleExamplesTool } from './get-style-examples.tool.js';
import { searchProductsTool } from './search-products.tool.js';
import { saveIntakeStateTool } from './save-intake-state.tool.js';
import { saveChecklistStateTool } from './save-checklist-state.tool.js';
import { saveProductRecommendationTool } from './save-product-recommendation.tool.js';

/**
 * All renovation agent tools for LangGraph binding
 */
export const renovationTools = [
  getStyleExamplesTool,
  searchProductsTool,
  saveIntakeStateTool,
  saveChecklistStateTool,
  saveProductRecommendationTool,
];
