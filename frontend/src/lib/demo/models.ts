/* The three models the course project trains. Every photo is checked by all three. Accuracy figures are placeholders for the demo. */
export type ModelId = "softmax" | "svm" | "mlp";

export const MODELS: { value: ModelId; label: string; short: string; description: string; accuracy: number }[] = [
  { value: "mlp", label: "Neural network", short: "Neural network", description: "2 hidden layers, 64 and 32 units", accuracy: 0.87 },
  { value: "svm", label: "SVM", short: "SVM", description: "RBF kernel on PCA + 5 features", accuracy: 0.84 },
  { value: "softmax", label: "Softmax regression", short: "Softmax", description: "Linear baseline", accuracy: 0.76 },
];

export const modelLabel = (id: ModelId) => MODELS.find((m) => m.value === id)?.label ?? id;
