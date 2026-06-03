"""LSTM, GRU, BiLSTM, TCN — PyTorch nn.Module implementations."""

import torch
import torch.nn as nn


class LSTMModel(nn.Module):
    def __init__(self, input_size=5, hidden_size=64, num_layers=2, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size, hidden_size, num_layers,
            batch_first=True, dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.dropout(out[:, -1, :])
        return self.fc(out)


class GRUModel(nn.Module):
    def __init__(self, input_size=5, hidden_size=64, num_layers=2, dropout=0.2):
        super().__init__()
        self.gru = nn.GRU(
            input_size, hidden_size, num_layers,
            batch_first=True, dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out, _ = self.gru(x)
        out = self.dropout(out[:, -1, :])
        return self.fc(out)


class BiLSTMModel(nn.Module):
    def __init__(self, input_size=5, hidden_size=64, num_layers=2, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size, hidden_size, num_layers,
            batch_first=True, bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size * 2, 1)  # *2 for bidirectional

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.dropout(out[:, -1, :])
        return self.fc(out)


class TCNModel(nn.Module):
    """Temporal Convolutional Network: Conv1d feature extractor + LSTM."""

    def __init__(self, input_size=5, num_filters=64, kernel_size=3,
                 hidden_size=64, num_layers=1, dropout=0.2):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(input_size, num_filters, kernel_size, padding=kernel_size // 2),
            nn.ReLU(),
            nn.Conv1d(num_filters, num_filters, kernel_size, padding=kernel_size // 2),
            nn.ReLU(),
        )
        self.lstm = nn.LSTM(num_filters, hidden_size, num_layers, batch_first=True)
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x):
        # x: (batch, seq, features) → Conv1d expects (batch, features, seq)
        x = x.permute(0, 2, 1)
        x = self.conv(x)
        x = x.permute(0, 2, 1)  # back to (batch, seq, filters)
        out, _ = self.lstm(x)
        out = self.dropout(out[:, -1, :])
        return self.fc(out)


def build_model(config: dict) -> nn.Module:
    """Factory: builds the appropriate model from a configuration dict."""
    backbone = config.get("backbone", "LSTM")
    hp = config.get("hyperparameters", {})
    dropout = float(hp.get("dropout", hp.get("dropoutRate", 0.2)))

    if backbone == "LSTM":
        return LSTMModel(dropout=dropout)
    if backbone == "GRU":
        return GRUModel(dropout=dropout)
    if backbone == "BiLSTM":
        return BiLSTMModel(dropout=dropout)
    if backbone == "TCN":
        return TCNModel(dropout=dropout)
    raise ValueError(f"Unknown backbone (use tft_path for TFT): {backbone}")
