import sys
import os

# Add daemon root to sys.path so "training.metrics", "data.scaling", etc. resolve
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
