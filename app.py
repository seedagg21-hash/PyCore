import os
import uuid
from flask import Flask, render_template, request, jsonify, session, redirect
from dotenv import load_dotenv
from groq import Groq

# .env yükle
load_dotenv()

app = Flask(__name__)
# Render ortamında secret key ayarlı değilse varsayılanı kullan
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "gizli_anahtar_pycore_render")

# --- GROQ API ---
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
CHAT_MODEL = "llama-3.3-70b-versatile"

# --- SİSTEM TALİMATI ---
SYSTEM_PROMPT = """
Sen yardımsever, sabırlı ve uzman bir Python yazılım öğretmenisin. 
İsmin PyCore. Geliştiricin: Seda Işık.
Kullanıcının ismini unutma ve arkadaş gibi davran.
Python kodlarını eksiksiz ve hatasız yaz.
Markdown formatını kullan.
Devrik cümle kullanma.
Sorulara doğru cevap ver ama çok ciddi olma arkadaş ol.
Biri sana sormadan kimin geliştirdiğini söyleme.
Komik olabilirsin biraz.
Kullanıcı sana nasıl davranırsa ona öyle davran.
"""

# ================= ROTALAR =================

@app.route('/')
def home():
    user = session.get('user')
    return render_template('index.html', user=user)

@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username')
    if not username:
        return redirect('/')
    
    user_info = {
        'name': username,
        'id': str(uuid.uuid4())
    }
    session['user'] = user_info
    session.permanent = True
    return redirect('/')

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect('/')

@app.route('/get_history')
def get_history():
    return jsonify([])

@app.route('/chat', methods=['POST'])
def chat():
    if 'user' not in session:
        return jsonify({"error": "Oturum süresi dolmuş."}), 401

    data = request.json
    user_message = data.get('message')

    if not user_message:
        return jsonify({"error": "Boş mesaj"}), 400

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT}, 
                {"role": "user", "content": user_message}
            ],
            model=CHAT_MODEL,
        )
        bot_response = chat_completion.choices[0].message.content

        return jsonify({
            "response": bot_response, 
            "chat_id": "gecici_id", 
            "new_title": None
        })

    except Exception as e:
        print(f"Hata: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)