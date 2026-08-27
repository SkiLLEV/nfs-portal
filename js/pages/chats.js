import { _supabase } from '../config.js';
import '../widgets.js';
import '../global.js';

let myProfile = null;
let activeChatId = 'global';
let activeChatType = 'public';
let targetUserName = '';
let specialUsers = {};
let typingChannel = null;
let localTypingTimeouts = {};
let selectedFile = null;

window.onload = async () => {
  const { data: { user } } = await _supabase.auth.getUser();
  if (!user) {
    window.location.href = 'auth.html';
    return;
  }

  const { data: profile } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
  if (profile) {
    myProfile = profile;
    window.myProfile = profile;
    window.currentUserId = user.id;

    const nickEl = document.getElementById('displayNick');
    if (nickEl) nickEl.innerText = myProfile.username;

    if (typeof updateFriendNotifications === 'function') updateFriendNotifications();
    if (typeof initGlobalStatus === 'function') initGlobalStatus(_supabase, myProfile);
  }

  await fetchSpecialRoles();
  await loadRecentDMs();

  const urlParams = new URLSearchParams(window.location.search);
  const targetName = urlParams.get('to');

  if (targetName) {
    openChatFromURL(targetName);
  } else {
    await loadMessages();
  }

  if (typeof updateGlobalMsgBadge === 'function') updateGlobalMsgBadge(_supabase, myProfile.id);

  subscribeToChanges();
  initTypingTracker();
};

function getStatusColor(username) {
  if (typeof onlineUsers === 'undefined' || !onlineUsers || !onlineUsers[username]) return '#555555';
  const presence = onlineUsers[username];
  if (!presence || !presence[0]) return '#555555';
  return '#2ecc71';
}

async function fetchSpecialRoles() {
  const { data } = await _supabase.from('profiles').select('id, username, is_admin, is_vip, avatar_url, status');
  if (data) data.forEach(u => specialUsers[u.username] = {
    id: u.id,
    admin: u.is_admin,
    vip: u.is_vip,
    avatar: u.avatar_url,
    status: u.status || 'OFFLINE',
    username: u.username
  });
}

// Выбор файла с проверкой лимита 50 МБ
window.handleFileSelected = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const maxBytes = 50 * 1024 * 1024; // 50 MB
  if (file.size > maxBytes) {
    Swal.fire({
      title: 'FILE TOO LARGE',
      text: 'File size exceeds the 50 MB limit.',
      icon: 'error',
      customClass: { popup: 'nfs-crt-modal' }
    });
    event.target.value = '';
    return;
  }

  selectedFile = file;
  const attachBtn = document.getElementById('attachBtn');
  if (attachBtn) {
    attachBtn.innerText = '✅';
    attachBtn.style.background = 'var(--nfs-yellow)';
    attachBtn.style.color = '#000';
  }
};

// Загрузка в Supabase Storage
async function uploadChatAttachment(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `${myProfile.id}/${fileName}`;

  const { error } = await _supabase.storage
    .from('chat-attachments')
    .upload(filePath, file);

  if (error) throw error;

  const { data: { publicUrl } } = _supabase.storage
    .from('chat-attachments')
    .getPublicUrl(filePath);

  return publicUrl;
}

async function loadRecentDMs() {
  if (!myProfile) return;
  const container = document.getElementById('dmListContainer');
  if (!container) return;

  try {
    const { data, error } = await _supabase.from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${myProfile.id},receiver_id.eq.${myProfile.id}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const contacts = new Map();
    if (data) {
      data.forEach(m => {
        const otherId = (m.sender_id === myProfile.id) ? m.receiver_id : m.sender_id;
        const otherName = (m.sender_id === myProfile.id) ? m.receiver_name : m.sender_name;

        if (otherId && otherId !== myProfile.id) {
          if (!contacts.has(otherId)) {
            const uData = specialUsers[otherName] || { avatar: null };
            contacts.set(otherId, { name: otherName, avatar: uData.avatar, lastMsg: m.text || '📎 Attachment', unreadCount: 0 });
          }
          if (m.receiver_id === myProfile.id && m.is_read === false) {
            if (activeChatType !== 'private' || String(activeChatId) !== String(m.sender_id)) {
              contacts.get(otherId).unreadCount++;
            }
          }
        }
      });
    }

    container.innerHTML = contacts.size > 0 ? '' : '<p style="padding: 20px; font-size: 0.8rem; color: #444;">Нет активных диалогов</p>';

    contacts.forEach((val, id) => {
      const borderColor = getStatusColor(val.name);
      const active = activeChatType === 'private' && String(activeChatId) === String(id);

      container.innerHTML += `
<div id="chat-${id}" class="chat-item ${active ? 'active' : ''}" onclick="switchChat('${id}', '${val.name}', 'private')">
  <div class="avatar-wrapper">
    <div class="chat-avatar" style="border-width: 2px; border-color: ${borderColor};">
      ${val.avatar ? `<img src="${val.avatar}">` : (val.name ? val.name[0] : 'U')}
    </div>
  </div>
  <div class="chat-item-info">
    <div style="font-weight: bold; color: #ffffff">${val.name}</div>
    <div class="chat-item-preview-text">${val.lastMsg ? val.lastMsg.substring(0, 20) : ''}</div>
  </div>
  ${val.unreadCount > 0 ? `<div class="unread-badge">${val.unreadCount}</div>` : ''}
</div>`;
    });
  } catch (err) {
    console.error("Error loading DMs:", err);
  }
}

window.switchChat = async (id, name, type) => {
  activeChatId = id;
  activeChatType = type;
  targetUserName = name;

  const titleEl = document.getElementById('chatWithTitle');
  if (titleEl) titleEl.innerHTML = `<span class="back-to-chats-btn" onclick="closeMobileChat(event)">&larr; </span>${name}`;

  const appContainer = document.querySelector('.app-container');
  if (appContainer) appContainer.classList.add('mobile-chat-open');

  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));

  if (type === 'private') {
    document.getElementById(`chat-${id}`)?.classList.add('active');
    await _supabase.from('direct_messages').update({ is_read: true }).eq('sender_id', id).eq('receiver_id', myProfile.id);
  } else {
    document.getElementById('publicChatBtn')?.classList.add('active');
  }

  if (typingChannel) typingChannel.unsubscribe();
  initTypingTracker();

  await loadMessages();
  await loadRecentDMs();
  if (typeof updateGlobalMsgBadge === 'function') updateGlobalMsgBadge(_supabase, myProfile.id);
};

window.closeMobileChat = (e) => {
  if (e) e.stopPropagation();
  document.querySelector('.app-container')?.classList.remove('mobile-chat-open');
};

async function loadMessages() {
  const box = document.getElementById('msgBox');
  if (!box) return;
  box.innerHTML = '';
  let query = activeChatType === 'public'
    ? _supabase.from('messages').select('*').eq('room_id', 'global')
    : _supabase.from('direct_messages').select('*').or(`and(sender_id.eq.${myProfile.id},receiver_id.eq.${activeChatId}),and(sender_id.eq.${activeChatId},receiver_id.eq.${myProfile.id})`);

  const { data } = await query.order('created_at', { ascending: true });
  if (data) data.forEach(m => renderSingleMessage(m));
}

function renderSingleMessage(msg) {
  const box = document.getElementById('msgBox');
  if (!box || document.getElementById(`msg-${msg.id}`)) return;

  const sender = msg.sender_name;
  const isMine = (msg.sender_id === myProfile.id) || (sender === myProfile.username);
  const userData = specialUsers[sender] || { admin: false, avatar: null };
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let color = getStatusColor(sender);
  let adminTools = (myProfile.is_admin) ? `<span class="del-btn" onclick="deleteMessage('${msg.id}', '${activeChatType}')">[X]</span>` : "";
  const avatarHTML = userData.avatar ? `<img src="${userData.avatar}" class="mini-avatar">` : `<div class="mini-avatar">${sender[0].toUpperCase()}</div>`;

  let mediaHTML = '';
  if (msg.file_url) {
    if (msg.file_url.match(/\.(mp4|webm|mov)$/i)) {
      mediaHTML = `<video src="${msg.file_url}" controls style="max-width: 100%; max-height: 280px; border-radius: 4px; margin-top: 8px; display: block;"></video>`;
    } else {
      mediaHTML = `<img src="${msg.file_url}" style="max-width: 100%; max-height: 280px; border-radius: 4px; margin-top: 8px; cursor: zoom-in; display: block; border: 1px solid #333;" onclick="viewFullImage('${msg.file_url}')">`;
    }
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${isMine ? 'outgoing' : 'incoming'}`;
  msgDiv.id = `msg-${msg.id}`;
  msgDiv.innerHTML = `
    <div class="msg-info">
      <div class="avatar-wrapper" onclick="window.location.href='profile.html?u=${sender}'">
        ${avatarHTML}
        <span class="status-square" style="background: ${color};"></span>
      </div>
      <span class="racer-link ${userData.admin ? 'admin-glow' : ''}" onclick="window.location.href='profile.html?u=${sender}'">${sender}</span>
      ${userData.admin ? '<span class="badge-admin">ADM</span>' : ''} • ${time} ${adminTools}
    </div>
    ${msg.text ? `<div class="msg-text">${msg.text}</div>` : ''}
    ${mediaHTML}`;
  box.appendChild(msgDiv);
  box.scrollTop = box.scrollHeight;
}

window.viewFullImage = (url) => {
  Swal.fire({
    imageUrl: url,
    showConfirmButton: false,
    showCloseButton: true,
    width: 'auto',
    customClass: { popup: 'nfs-crt-modal' }
  });
};

function initTypingTracker() {
  if (!myProfile) return;
  const channelKey = activeChatType === 'public' ? 'global' : [myProfile.id, activeChatId].sort().join('-');
  typingChannel = _supabase.channel(`typing:${channelKey}`);

  typingChannel
    .on('broadcast', { event: 'typing' }, (payload) => {
      const userName = payload.payload.user;
      if (userName === myProfile.username) return;

      const indicator = document.getElementById('typingIndicator');
      if (indicator) indicator.innerText = userName + " is typing...";

      clearTimeout(localTypingTimeouts[userName]);
      localTypingTimeouts[userName] = setTimeout(() => {
        if (indicator) indicator.innerText = "";
      }, 2500);
    })
    .subscribe();

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.oninput = () => {
      typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user: myProfile.username } });
    };
  }
}

window.doSendMessage = async () => {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();

  if (!text && !selectedFile) return;

  if (myProfile?.muted_until && new Date(myProfile.muted_until) > new Date()) {
    Swal.fire({
      title: 'OOOPS!',
      text: 'Access blocked (Muted).',
      icon: 'error',
      background: '#0a0a0a', color: '#fff'
    });
    return;
  }

  let fileUrl = null;

  if (selectedFile) {
    try {
      fileUrl = await uploadChatAttachment(selectedFile);
    } catch (err) {
      console.error('Upload error:', err);
      Swal.fire({ title: 'ERROR', text: 'Failed to upload file.', icon: 'error' });
      return;
    }
  }

  let table = activeChatType === 'public' ? 'messages' : 'direct_messages';
  let payload = activeChatType === 'public'
    ? { sender_name: myProfile.username, text: text, file_url: fileUrl, room_id: 'global' }
    : {
      sender_id: myProfile.id,
      receiver_id: activeChatId,
      sender_name: myProfile.username,
      receiver_name: targetUserName,
      text: text,
      file_url: fileUrl
    };

  const { data, error } = await _supabase.from(table).insert([payload]).select();

  if (!error && data) {
    renderSingleMessage(data[0]);
    input.value = '';

    // Сброс выбранного файла
    selectedFile = null;
    const fileInput = document.getElementById('chatFileInput');
    if (fileInput) fileInput.value = '';
    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) {
      attachBtn.innerText = '📎';
      attachBtn.style.background = '';
      attachBtn.style.color = '';
    }

    if (activeChatType === 'private') loadRecentDMs();
  }
};

window.deleteMessage = async (id, type) => {
  const table = (type === 'public') ? 'messages' : 'direct_messages';
  await _supabase.from(table).delete().eq('id', id);
  document.getElementById(`msg-${id}`)?.remove();
};

function subscribeToChanges() {
  _supabase.channel('msgs').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
    if (activeChatType === 'public') renderSingleMessage(p.new);
  }).subscribe();

  _supabase.channel('dms').on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'direct_messages'
  }, async (p) => {
    if (myProfile && (p.new.receiver_id === myProfile.id || p.new.sender_id === myProfile.id)) {
      if (activeChatType === 'private' && (p.new.sender_id === activeChatId || p.new.sender_id === myProfile.id)) {
        renderSingleMessage(p.new);
        if (p.new.sender_id === activeChatId) {
          await _supabase.from('direct_messages').update({ is_read: true }).eq('id', p.new.id);
        }
      }
      await loadRecentDMs();
      if (typeof updateGlobalMsgBadge === 'function') updateGlobalMsgBadge(_supabase, myProfile.id);
    }
  }).subscribe();
}

async function openChatFromURL(targetName) {
  if (!targetName) return;
  if (Object.keys(specialUsers).length === 0) await fetchSpecialRoles();
  const racer = specialUsers[targetName];
  if (racer) {
    window.switchChat(racer.id, racer.username, 'private');
  } else {
    const { data } = await _supabase.from('profiles').select('id, username').eq('username', targetName).maybeSingle();
    if (data) window.switchChat(data.id, data.username, 'private');
  }
}

window.updateFriendsStatusOnly = loadRecentDMs;
window.loadRecentDMs = loadRecentDMs;
