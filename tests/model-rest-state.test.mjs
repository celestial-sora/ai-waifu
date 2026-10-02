import assert from "node:assert/strict";
import { test } from "node:test";
import { captureModelRestState, restoreModelRestState } from "../lib/model-rest-state.ts";

function fixture(defaults, opacities) {
  const values = [...defaults];
  const parts = { count: opacities.length, opacities: [...opacities] };
  let saved = [...values];
  return {
    values, parts,
    getParameterCount: () => values.length,
    getParameterDefaultValue: (index) => defaults[index],
    setParameterValueByIndex: (index, value) => { values[index] = value; },
    getModel: () => ({ parts }),
    setPartOpacityByIndex: (index, value) => { parts.opacities[index] = value; },
    saveParameters: () => { saved = [...values]; },
    nextFrame: () => { values.splice(0, values.length, ...saved); },
  };
}

test("stopping an accessory motion clears values absent from idle and survives the next frame", () => {
  const model = fixture([0, 1, 0.3], [0, 1]);
  const rest = captureModelRestState(model);
  // A motion enables a butterfly and leaves its final values saved; idle
  // writes only breathing/eye parameters and cannot disable this accessory.
  model.values[0] = 1;
  model.values[2] = 0.9;
  model.parts.opacities[0] = 1;
  model.parts.opacities[1] = 0;
  model.saveParameters();
  restoreModelRestState(model, rest);
  model.nextFrame();
  assert.deepEqual(model.values, [0, 1, 0.3]);
  assert.deepEqual(model.parts.opacities, [0, 1]);
  // Re-enable and reset repeatedly without changing the stored rest snapshot.
  model.values[0] = 1;
  model.saveParameters();
  restoreModelRestState(model, rest);
  model.nextFrame();
  assert.equal(model.values[0], 0);
});

test("rest uses authored nonzero defaults and keeps each model's initial parts", () => {
  const first = fixture([0.8, -0.5], [0.25, 0]);
  const second = fixture([1, 0, -2], [1]);
  const firstRest = captureModelRestState(first);
  const secondRest = captureModelRestState(second);
  first.values.fill(0); first.parts.opacities.fill(1);
  second.values.fill(0); second.parts.opacities.fill(0);
  restoreModelRestState(first, firstRest);
  restoreModelRestState(second, secondRest);
  assert.deepEqual(first.values, [0.8, -0.5]);
  assert.deepEqual(first.parts.opacities, [0.25, 0]);
  assert.deepEqual(second.values, [1, 0, -2]);
  assert.deepEqual(second.parts.opacities, [1]);
});
