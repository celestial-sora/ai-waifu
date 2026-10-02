// Cubism motions persist parameter values between frames. Stopping their queue
// alone cannot undo accessory toggles or poses that the idle motion never writes.
export interface CubismRestModel {
  getParameterCount(): number;
  getParameterDefaultValue(index: number): number;
  setParameterValueByIndex(index: number, value: number): void;
  getModel(): { parts: { count: number; opacities: ArrayLike<number> } };
  setPartOpacityByIndex(index: number, value: number): void;
  saveParameters(): void;
}

export interface ModelRestState {
  parameters: number[];
  partOpacities: number[];
}

export function captureModelRestState(model: CubismRestModel): ModelRestState {
  return {
    parameters: Array.from({ length: model.getParameterCount() }, (_, index) => model.getParameterDefaultValue(index)),
    // Parts have no public default-opacity API; capture their initial values
    // before the model's first ticker update, separately for each imported model.
    partOpacities: Array.from(model.getModel().parts.opacities),
  };
}

export function restoreModelRestState(model: CubismRestModel, rest: ModelRestState): void {
  for (let index = 0; index < Math.min(model.getParameterCount(), rest.parameters.length); index += 1) {
    model.setParameterValueByIndex(index, rest.parameters[index]);
  }
  for (let index = 0; index < Math.min(model.getModel().parts.count, rest.partOpacities.length); index += 1) {
    model.setPartOpacityByIndex(index, rest.partOpacities[index]);
  }
  // Updating live values alone is insufficient: Cubism reloads saved parameters
  // after rendering, so also replace the persistent baseline for the next frame.
  model.saveParameters();
}
