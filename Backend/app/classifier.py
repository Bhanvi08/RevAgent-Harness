from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

# Training examples: (message, intent, recommended_action)
TRAINING_DATA = [
    ("what is the price of your plan", "pricing", "Send pricing PDF"),
    ("how much does this cost", "pricing", "Send pricing PDF"),
    ("can you tell me the cost", "pricing", "Send pricing PDF"),
    ("is there a discount available", "pricing", "Send pricing PDF"),
    ("what are your rates", "pricing", "Send pricing PDF"),
    ("i want to book a demo", "booking", "Auto-schedule demo call"),
    ("can we schedule an appointment", "booking", "Auto-schedule demo call"),
    ("book a call with sales", "booking", "Auto-schedule demo call"),
    ("when can we meet", "booking", "Auto-schedule demo call"),
    ("i'd like to set up a meeting", "booking", "Auto-schedule demo call"),
    ("i have a complaint about your service", "complaint", "Escalate to senior support"),
    ("this is not working and i am upset", "complaint", "Escalate to senior support"),
    ("i want to speak to a manager", "complaint", "Escalate to senior support"),
    ("there is an issue with my order", "complaint", "Escalate to senior support"),
    ("very disappointed with the product", "complaint", "Escalate to senior support"),
    ("just wanted general information", "general", "Send info brochure"),
    ("can you tell me more about your company", "general", "Send info brochure"),
    ("what services do you offer", "general", "Send info brochure"),
    ("hi i am interested in learning more", "general", "Send info brochure"),
]

_vectorizer = TfidfVectorizer()
_X = _vectorizer.fit_transform([m for m, _, _ in TRAINING_DATA])
_y = [intent for _, intent, _ in TRAINING_DATA]
_model = LogisticRegression()
_model.fit(_X, _y)

_ACTION_MAP = {intent: action for _, intent, action in TRAINING_DATA}

def classify_and_summarize(message: str):
    """Returns (intent, confidence, recommended_action, summary)"""
    X_new = _vectorizer.transform([message])
    intent = _model.predict(X_new)[0]
    confidence = float(_model.predict_proba(X_new).max())
    action = _ACTION_MAP.get(intent, "Route to human agent")
    summary = f"Customer message classified as '{intent}' intent (confidence {confidence:.2f})."
    return intent, confidence, action, summary