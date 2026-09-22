import { salesWorkflow } from './sales';
import { quoteWorkflow } from './quote';
import { paymentWorkflow } from './payment';
import { procurementWorkflow } from './procurement';
import { installationWorkflow } from './installation';
import { qcWorkflow } from './qc';
import { handoverWorkflow } from './handover';
import type { WorkflowDefinition } from '../types';

export { salesWorkflow, quoteWorkflow, paymentWorkflow, procurementWorkflow, installationWorkflow, qcWorkflow, handoverWorkflow };

/** Every workflow definition, keyed by `WorkflowDefinition.key`. Screens and
 * the Phase 07 event bus look workflows up here rather than importing
 * individual definition files by name. */
export const workflowRegistry: Record<string, WorkflowDefinition<string>> = {
  sales: salesWorkflow as WorkflowDefinition<string>,
  quote: quoteWorkflow as WorkflowDefinition<string>,
  payment: paymentWorkflow as WorkflowDefinition<string>,
  procurement: procurementWorkflow as WorkflowDefinition<string>,
  installation: installationWorkflow as WorkflowDefinition<string>,
  qc: qcWorkflow as WorkflowDefinition<string>,
  handover: handoverWorkflow as WorkflowDefinition<string>,
};
