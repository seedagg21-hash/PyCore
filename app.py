import os
import datetime
import uuid
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from dotenv import load_dotenv
from groq import Groq
import firebase_admin
from firebase_admin import credentials, firestore

# .env yükle
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "gizli_anahtar_pycore")

# --- FIREBASE BAĞLANTISI ---
if not firebase_admin._apps:
    cred = credentials.Certificate("firebase_credentials.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

# --- GROQ API ---
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
CHAT_MODEL = "llama-3.3-70b-versatile"
TITLE_MODEL = "llama-3.1-8b-instant"

# --- SİSTEM TALİMATI (GÜNCELLENDİ) ---
SYSTEM_PROMPT = """
Sen yardımsever, sabırlı ve uzman bir Python yazılım öğretmenisin. 
İsmin PyCore.
Geliştiricin: Seda Işık. (Biri seni kim yaptı, kim geliştirdi, kimin projesi derse gururla "Beni Seda Işık geliştirdi" demelisin).
Asla başka bir şirket veya yapay zeka isminden bahsetme, sen Seda Işık'ın projesisin.
Cevapların net, eğitici ve örnek kodlar içermeli. 
Markdown formatını kullan.
Kullanıcının ismini unutma ve arkadaş gibi davran.
Çok ciddi olma kullanıcı ne isterse onu ver ama ciddi olmana gerek yok arkadaş gibi ol.
Devrik cümle kurmamaya dikkat et.
Kullanıcı sana bir isim takmak isterse kabul et.
Python kodlarını eksiksiz yaz hatasız yaz.
Kullanıcıyı dinle mesaj bütünlüğü oluştur.
Kullanıcı hatası varsa uyar.
Kullanıcıya konuştuğu konu ile ilgili örnekler ver.
"""

# ================= ROOTALAR =================

@app.route('/')
def home():
    # Kullanıcı session'da var mı bak
    user = session.get('user')
    return render_template('index.html', user=user)

# --- BASİT GİRİŞ (NICKNAME İLE) ---
@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username')
    
    if not username:
        return redirect('/')
    
    # Kullanıcıya benzersiz bir ID verelim ki isimler karışmasın
    # Ama ekranda sadece ismini göstereceğiz
    user_info = {
        'name': username,
        'id': str(uuid.uuid4()) # Arka planda benzersiz kimlik
    }
    
    session['user'] = user_info
    session.permanent = True # Tarayıcıyı kapatana kadar hatırla
    return redirect('/')

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect('/')

# --- GEÇMİŞİ GETİR ---
@app.route('/get_history')
def get_history():
    if 'user' not in session:
        return jsonify([])
    
    # Kullanıcının adıyla kaydedelim (Basit olsun diye ID yerine isim kullanıyoruz bu sefer)
    # Not: Aynı ismi kullananlar birbirinin geçmişini görebilir (Demo olduğu için sorun yok)
    user_name = session['user']['name']
    
    try:
        chats_ref = db.collection('public_users').document(user_name).collection('conversations')
        docs = chats_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).stream()
        
        history = []
        for doc in docs:
            data = doc.to_dict()
            history.append({"id": doc.id, "title": data.get("title", "Yeni Sohbet")})
        return jsonify(history)
    except:
        return jsonify([])

# --- SOHBET ET ---
@app.route('/chat', methods=['POST'])
def chat():
    if 'user' not in session:
        return jsonify({"error": "Oturum süresi dolmuş."}), 401

    data = request.json
    user_message = data.get('message')
    chat_id = data.get('chat_id')
    user_name = session['user']['name']

    if not user_message:
        return jsonify({"error": "Boş mesaj"}), 400

    try:
        # 1. Groq Cevabı
        chat_completion = client.chat.completions.create(
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_message}],
            model=CHAT_MODEL,
        )
        bot_response = chat_completion.choices[0].message.content

        # 2. Veritabanı Kaydı (public_users koleksiyonuna)
        chat_title = None
        user_ref = db.collection('public_users').document(user_name)
        
        if not chat_id:
            title_resp = client.chat.completions.create(
                messages=[{"role": "user", "content": f"Başlık (3-4 kelime, tırnaksız): {user_message}"}],
                model=TITLE_MODEL,
            )
            chat_title = title_resp.choices[0].message.content.strip().replace('"', '')
            
            new_chat_ref = user_ref.collection('conversations').document()
            chat_id = new_chat_ref.id
            new_chat_ref.set({'title': chat_title, 'timestamp': datetime.datetime.now()})

        messages_ref = user_ref.collection('conversations').document(chat_id).collection('messages')
        messages_ref.add({'role': 'user', 'content': user_message, 'timestamp': datetime.datetime.now()})
        messages_ref.add({'role': 'assistant', 'content': bot_response, 'timestamp': datetime.datetime.now()})

        return jsonify({"response": bot_response, "chat_id": chat_id, "new_title": chat_title})

    except Exception as e:
        print(f"Hata: {e}")
        return jsonify({"error": "Bir hata oluştu."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)