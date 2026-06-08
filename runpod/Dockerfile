# QuantiForge RunPod Serverless Container
# Base image: official RunPod PyTorch image with CUDA 12.x
FROM runpod/pytorch:2.1.0-py3.10-cuda12.1.1-devel-ubuntu22.04

WORKDIR /app

# Copy daemon source (worker shares the training pipeline)
COPY daemon/ /app/daemon/
COPY runpod/worker.py /app/worker.py
COPY runpod/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r /app/requirements.txt

# Set PYTHONPATH so worker.py can import from /app/daemon
ENV PYTHONPATH=/app/daemon

CMD ["python", "/app/worker.py"]
