import os
import joblib
import pandas as pd
from sqlalchemy.orm import Session
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

MODEL_PATH = "transaction_iforest_model.pkl"

class TransactionAnomalyDetector:
    def __init__(self, contamination: float = 0.05, n_estimators: int = 100, max_samples: str = 'auto'):
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.max_samples = max_samples
        self.model = IsolationForest(
            contamination=self.contamination,
            n_estimators=self.n_estimators,
            max_samples=self.max_samples,
            random_state=42
        )
        self.scaler = StandardScaler()
        
    def get_data_from_db(self, db: Session) -> pd.DataFrame:
        """Fetch transactions from the database directly using pandas read_sql."""
        try:
            query = "SELECT id, account_id, type, amount, created_at FROM transactions"
            df = pd.read_sql(query, db.bind)
            return df
        except Exception as e:
            print(f"Error reading from DB: {e}")
            return pd.DataFrame()

    def preprocess(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        # Create numerical features from categorical
        df['amount'] = df['amount'].fillna(0.0)
        
        # Extract features
        type_mapping = {'deposit': 1, 'withdrawal': -1, 'transfer': -1}
        df['type_encoded'] = df['type'].map(type_mapping).fillna(0)
        
        # Standardize features
        features = df[['amount', 'type_encoded']]
        scaled_features = self.scaler.fit_transform(features)
        
        df['scaled_amount'] = scaled_features[:, 0]
        df['scaled_type'] = scaled_features[:, 1]
        return df

    def train(self, df: pd.DataFrame) -> pd.DataFrame:
        if len(df) < 10:
            df['anomaly_label'] = 1
            df['anomaly_score'] = 0.0
            return df

        df = self.preprocess(df)
        features = df[['scaled_amount', 'scaled_type']]
        
        # Fit the Isolation Forest model
        self.model.fit(features)
        
        # Predict: -1 for anomaly, 1 for normal
        df['anomaly_label'] = self.model.predict(features)
        # Decision function gives anomaly scores (lower means more anomalous)
        df['anomaly_score'] = self.model.decision_function(features)
        return df

    def save_model(self):
        joblib.dump({'model': self.model, 'scaler': self.scaler}, MODEL_PATH)

    def load_model(self):
        if os.path.exists(MODEL_PATH):
            data = joblib.load(MODEL_PATH)
            self.model = data['model']
            self.scaler = data['scaler']
            return True
        return False

    def predict_transaction(self, amount: float, txn_type: str) -> dict:
        """Apply pre-trained model on a single transaction."""
        if not self.load_model():
            return {"anomaly_label": 1, "anomaly_score": 0.0}
            
        type_val = {'deposit': 1, 'withdrawal': -1, 'transfer': -1}.get(txn_type, 0)
        
        raw_df = pd.DataFrame([{"amount": amount, "type_encoded": type_val}])
        scaled = self.scaler.transform(raw_df)
        
        label = self.model.predict(scaled)[0]
        score = self.model.decision_function(scaled)[0]
        
        return {
            "anomaly_label": int(label),
            "anomaly_score": float(score)
        }
