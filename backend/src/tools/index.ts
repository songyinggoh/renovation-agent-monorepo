import { generateDocumentTool } from './generate-document.tool.js';
import { generateRenderTool } from './generate-render.tool.js';
import { getStyleExamplesTool } from './get-style-examples.tool.js';
import { saveChecklistStateTool } from './save-checklist-state.tool.js';
import { saveIntakeStateTool } from './save-intake-state.tool.js';
import { savePlanStateTool } from './save-plan-state.tool.js';
import { saveProductRecommendationTool } from './save-product-recommendation.tool.js';
import { saveRendersStateTool } from './save-renders-state.tool.js';
import { searchProductsTool } from './search-products.tool.js';

/**
 * All renovation agent tools for LangGraph binding
 */
export const renovationTools = [
  getStyleExamplesTool,
  searchProductsTool,
  saveIntakeStateTool,
  saveChecklistStateTool,
  saveProductRecommendationTool,
  generateRenderTool,
  saveRendersStateTool,
  savePlanStateTool,
  generateDocumentTool,
];
