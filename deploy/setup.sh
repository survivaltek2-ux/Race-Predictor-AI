#!/bin/bash

# Setup script for Race-Predictor-AI

echo "Setting up environment..."

# Install dependencies
pip install -r requirements.txt

# Create a virtual environment
python -m venv venv

# Activate the virtual environment
source venv/bin/activate

echo "Setup completed successfully!"