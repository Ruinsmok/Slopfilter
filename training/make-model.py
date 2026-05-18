import onnxruntime as ort
# Load the model and create InferenceSession
model_path = "path/to/your/onnx/model"
session = ort.InferenceSession(model_path)
# "Load and preprocess the input image inputTensor"
...
# Run inference
outputs = session.run(None, {"input": inputTensor})
print(outputs)