#!/bin/bash

# Navigate to the scripts directory
cd "$(dirname "$0")"

echo "Setting up Python virtual environment..."

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
else
    echo "Virtual environment already exists."
fi

# Activate venv and install dependencies
echo "Installing/Updating dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install osmnx networkx geopandas numpy pandas scikit-learn

echo "Python environment setup complete!"
