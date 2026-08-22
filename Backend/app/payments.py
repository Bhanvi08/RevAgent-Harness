import os
import razorpay
from dotenv import load_dotenv

load_dotenv()

client = razorpay.Client(
    auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET"))
)

def create_payment_link(customer_name: str, amount_rupees: int, description: str):
    """Creates a real Razorpay test-mode payment link. Returns the link URL or None on failure."""
    try:
        link = client.payment_link.create({
            "amount": amount_rupees * 100,  # Razorpay expects paise
            "currency": "INR",
            "description": description,
            "customer": {"name": customer_name},
            "notify": {"sms": False, "email": False},
        })
        return link.get("short_url")
    except Exception as e:
        return None