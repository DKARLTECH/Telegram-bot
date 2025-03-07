import telebot
import yt_dlp
import os

# Your Telegram Bot Token (Replace immediately if exposed)
BOT_TOKEN = "7583055920:AAEhTcCP3-2nKK9KnB2UvyWQVgIPG3COJUw"

bot = telebot.TeleBot(BOT_TOKEN)

# Function to download videos
def download_video(url):
    ydl_opts = {
        'outtmpl': 'video.%(ext)s',  # Save as video.mp4 or appropriate extension
        'format': 'best',
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return ydl.prepare_filename(info)  # Returns the downloaded file path

# Handle incoming messages
@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, "Send me a video link from YouTube, Facebook, Twitter, etc., and I'll download it for you!")

@bot.message_handler(func=lambda message: True)
def handle_message(message):
    url = message.text
    bot.reply_to(message, "Downloading... Please wait.")
    
    try:
        video_path = download_video(url)
        bot.send_video(message.chat.id, open(video_path, "rb"))
        os.remove(video_path)  # Delete after sending
    except Exception as e:
        bot.reply_to(message, f"Error: {e}")

# Start bot
bot.polling()
