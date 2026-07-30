import {_supabase} from '../config.js';
import '../widgets.js';
import '../global.js';

if (typeof onlineUsers === 'undefined') window.onlineUsers = {};

window.currentUserId = null;
window.myProfile = null;
window.profileData = null;

window.onload = async () => {
  const {data: {user}} = await _supabase.auth.getUser();
  if (!user) {
    window.location.href = 'auth.html';
    return;
  }
  window.currentUserId = user.id;

  const {data: me} = await _supabase.from('profiles').select('*').eq('id', window.currentUserId).single();
  if (me) {
    window.myProfile = me;

    await checkDailyBonus(me);

    const savedStatus = localStorage.getItem('driver_status') || me.status || 'ONLINE';
    window.myProfile.status = savedStatus;

    await _supabase.from('profiles').update({status: savedStatus}).eq('id', user.id);
    if (typeof window.trackMyStatus === 'function') await window.trackMyStatus(savedStatus);

    const nickEl = document.getElementById('displayNick');
    if (nickEl) nickEl.innerText = me.username;
    if (typeof updateFriendNotifications === 'function') updateFriendNotifications();
    if (typeof initGlobalStatus === 'function') initGlobalStatus(_supabase, me);
    if (typeof updateGlobalMsgBadge === 'function') updateGlobalMsgBadge(_supabase, me.id);

    checkAdminReplies();

    _supabase.channel('support-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_tickets',
        filter: `user_id=eq.${me.id}`
      }, (payload) => {
        checkAdminReplies();
        if (payload.new.status === 'resolved' && !payload.new.is_read) {
          if (typeof playNotificationSound === 'function') playNotificationSound();
        }
      })
      .subscribe();
  }

  const urlParams = new URLSearchParams(window.location.search);
  const targetName = urlParams.get('u');

  if (targetName) {
    const {data} = await _supabase.from('profiles').select('*').ilike('username', targetName).maybeSingle();
    if (data) {
      window.profileData = data;
      setupProfileRealtimeListener();
      renderFullProfile(data, data.id === window.currentUserId);
      updateRacerRank(data.id);
      checkFriendshipStatus(data.id);
    } else {
      await loadMyOwnProfile(user.id);
      checkFriendshipStatus(user.id);
    }
  } else {
    await loadMyOwnProfile(user.id);
    checkFriendshipStatus(user.id);
  }
};

window.updateLiveStatusUI = function () {
  const el = document.getElementById('statusIndicator');
  if (!el || !window.profileData) return;

  const presence = (typeof onlineUsers !== 'undefined' ? onlineUsers[window.profileData.username] : null);
  const isItMe = (window.myProfile && window.profileData.id === window.myProfile.id);

  let s = 'ONLINE';
  if (isItMe) {
    s = localStorage.getItem('driver_status') || 'ONLINE';
  } else if (presence && presence[0] && presence[0].status) {
    s = presence[0].status;
  } else {
    s = window.profileData.status || 'ONLINE';
  }

  if (!presence && !isItMe) {
    let lastSeenTime = "long ago";
    if (window.profileData.last_seen && typeof formatLastSeen === 'function') {
      lastSeenTime = formatLastSeen(window.profileData.last_seen);
    }
    el.innerHTML = `<div>Currently Offline</div><div style="font-size: 1.05rem; font-weight: normal; color: #8f98a0; margin-top: 2px;">Last Online ${lastSeenTime}</div>`;
    el.className = 'status-badge status-offline';
  } else {
    if (s === 'LOOKING FOR GAME') {
      el.innerHTML = `<div>LFG</div>`;
      el.className = 'status-badge status-ingame';
    } else {
      el.innerHTML = '<div>Currently Online</div>';
      el.className = 'status-badge status-online';
    }
  }
};

async function loadMyOwnProfile(userId) {
  try {
    const {data, error} = await _supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    if (data) {
      window.profileData = data;
      const currentLocal = localStorage.getItem('driver_status') || 'ONLINE';
      window.profileData.status = currentLocal;

      setupProfileRealtimeListener();
      renderFullProfile(window.profileData, true);
      updateRacerRank(data.id);
    }
  } catch (err) {
    console.error("Error loading your profile:", err);
    const profName = document.getElementById('profName');
    if (profName) profName.innerText = "ERROR!";
  }
}

async function updateRacerRank(targetUserId) {
  const {data: racers} = await _supabase.from('profiles').select('id').order('rating', {ascending: false});
  if (racers) {
    const rank = racers.findIndex(r => r.id === targetUserId) + 1;
    const rankEl = document.getElementById('rankDisplay');
    if (rankEl) rankEl.innerText = `(#${rank})`;
  }
}

function renderFullProfile(data, isMine) {
  const nameEl = document.getElementById('profName');
  const badgeEl = document.getElementById('badgeContainer');
  const frameEl = document.getElementById('avatarFrame');

  if (frameEl) {
    frameEl.className = 'avatar-container';
    if (data.selected_frame) frameEl.classList.add(data.selected_frame);
    else if (data.username === 'Davenport' || data.username === 'test1') frameEl.classList.add('frame-mw');
    else if (data.is_admin) frameEl.classList.add('frame-admin');
    else if (data.is_mod) frameEl.classList.add('frame-mod');
    else if (data.is_vip) frameEl.classList.add('frame-vip');
    else frameEl.classList.add('frame-default');
  }

  if (nameEl) {
    nameEl.innerText = data.username;
    if (data.is_admin) {
      nameEl.classList.add('admin-glow');
      if (badgeEl) badgeEl.innerHTML = `<span class="badge badge-admin">ADM</span>`;
    } else if (data.is_vip) {
      nameEl.classList.add('vip-glow');
      if (badgeEl) badgeEl.innerHTML = `<span class="badge badge-vip">VIP</span>`;
    } else {
      if (badgeEl) badgeEl.innerHTML = '';
    }
  }

  const adminMuteBtn = document.getElementById('adminMuteBtn');
  if (adminMuteBtn) {
    if (window.myProfile && window.myProfile.is_admin && !isMine) adminMuteBtn.classList.remove('hidden');
    else adminMuteBtn.classList.add('hidden');
  }

  // БЕЗОПАСНОЕ ОБНОВЛЕНИЕ БИО И РЕЙТИНГА
  const bioEl = document.getElementById('profBio');
  if (bioEl) bioEl.innerText = data.bio || "Elite racer of Rockport";

  const ratingEl = document.getElementById('profRating');
  if (ratingEl) ratingEl.innerText = `★ ${data.rating ? data.rating.toLocaleString() : 0}`;

  const levelEl = document.getElementById('profLevel');
  if (levelEl) levelEl.innerText = data.level || 1;

  const box = document.getElementById('avatarBox');
  if (box) {
    box.innerHTML = data.avatar_url ? `<img src="${data.avatar_url}">` : `<span class="avatar-letter">${data.username ? data.username[0].toUpperCase() : '?'}</span>`;
  }

  renderGarage(data.photos);

  const editBtn = document.getElementById('editBtn');
  const statusSelect = document.getElementById('statusSelect');
  const addCarBtn = document.getElementById('addCarBtn');
  const msgBtn = document.getElementById('msgBtn');
  const friendBtn = document.getElementById('friendBtn');

  [editBtn, statusSelect, addCarBtn, msgBtn, friendBtn].forEach(el => {
    if (el) el.style.display = '';
  });

  if (isMine) {
    if (editBtn) editBtn.classList.remove('hidden');
    if (addCarBtn) addCarBtn.classList.remove('hidden');
    if (statusSelect) {
      statusSelect.classList.remove('hidden');
      statusSelect.value = localStorage.getItem('driver_status') || data.status || 'ONLINE';
    }
    if (msgBtn) msgBtn.classList.add('hidden');
    if (friendBtn) friendBtn.classList.add('hidden');
  } else {
    if (editBtn) editBtn.classList.add('hidden');
    if (addCarBtn) addCarBtn.classList.add('hidden');
    if (statusSelect) statusSelect.classList.add('hidden');

    if (msgBtn) {
      msgBtn.classList.remove('hidden');
      msgBtn.onclick = () => goToChat(data.username);
    }
    if (friendBtn) friendBtn.classList.remove('hidden');
  }

  if (typeof window.updateLiveStatusUI === 'function') window.updateLiveStatusUI();
}

function renderGarage(photos) {
  const container = document.getElementById('garageContainer');
  if (!container) return;
  container.innerHTML = photos?.length ? '' : '<p style="color:#555">Avoid...</p>';
  photos?.forEach((url) => {
    container.innerHTML += `<div class="car-card" onclick="viewFullImage('${url}')"><img src="${url}"></div>`;
  });
}

window.viewFullImage = (url) => {
  Swal.fire({
    imageUrl: url,
    showConfirmButton: false,
    showCloseButton: true,
    width: 'auto',
    customClass: {popup: 'nfs-crt-modal'}
  });
};

window.addNewCarPhoto = async () => {
  const {value: url} = await Swal.fire({
    input: 'url',
    html: `
      <div style="font-family: Arial, sans-serif !important; font-size: 1.02rem; color: #ccc; text-align: left; margin-bottom: 10px; line-height: 1.4;">
        STEP 1: Add your photo on PostImages<br>
        STEP 2: Insert a DIRECT LINK below (.jpg, .png)
      </div>
    `,
    inputPlaceholder: 'https://i.postimg.cc/..../image.jpg',
    confirmButtonText: 'IN GARAGE',
    showCancelButton: true,
    cancelButtonText: 'CANCEL',
    footer: `<a href="https://postimages.org/" target="_blank" class="nfs-font" style="color: #f1c40f; font-weight: bold; text-decoration: none;" onmouseover="this.style.color='#ff0000'; this.style.textDecoration='underline';" onmouseout="this.style.color='#f1c40f'; this.style.textDecoration='none';">TO OPEN POSTIMAGES.ORG</a>`,
    customClass: {popup: 'nfs-crt-modal'},
    didOpen: () => {
      const confirmBtn = Swal.getConfirmButton();
      if (confirmBtn) {
        confirmBtn.style.border = 'none';
        confirmBtn.style.boxShadow = '0 0 10px rgba(241, 196, 15, 0.5)';
      }
    }
  });

  if (url) {
    if (!url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      Swal.fire({
        title: 'ERROR',
        text: 'That`s not direct link!',
        icon: 'error',
        customClass: {popup: 'nfs-crt-modal'}
      });
      return;
    }
    const currentPhotos = Array.isArray(window.profileData.photos) ? window.profileData.photos : [];
    const updatedPhotos = [...currentPhotos, url];
    const {error} = await _supabase.from('profiles').update({photos: updatedPhotos}).eq('id', window.currentUserId);
    if (!error) setTimeout(() => location.reload(), 1200);
  }
};

window.updateUserStatus = async () => {
  const s = document.getElementById('statusSelect').value;
  localStorage.setItem('driver_status', s);

  if (window.profileData) window.profileData.status = s;
  if (window.myProfile) window.myProfile.status = s;

  window.updateLiveStatusUI();

  const {error} = await _supabase.from('profiles').update({status: s}).eq('id', window.currentUserId);
  if (!error && typeof window.trackMyStatus === 'function') {
    await window.trackMyStatus(s);
  }
};

window.openEditProfile = async () => {
  const frames = [{id: 'frame-default', name: 'Standart'}, {id: 'frame-mw', name: 'Most Wanted'}];
  let framesHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">';
  frames.forEach(f => {
    const isSelected = window.profileData.selected_frame === f.id ? 'border: 2px solid var(--nfs-yellow);' : 'border: 1px solid #333;';
    framesHtml += `<div onclick="selectFrame('${f.id}')" id="${f.id}" class="frame-preview ${f.id}" style="cursor:pointer; padding:10px; ${isSelected} background: rgba(0,0,0,0.5); font-size: 0.7rem; text-align: center;">${f.name.toUpperCase()}</div>`;
  });
  framesHtml += '</div>';

  const {value: formValues} = await Swal.fire({
    html: `
      <p style="font-size:0.8rem; text-align: center; text-transform: uppercase;">BIO:</p>
      <input id="swal-bio" class="swal2-input" value="${window.profileData.bio || ''}" style="background:#111; color:#fff; width:100%; box-sizing:border-box; text-align: center; margin: 10px 0;">
      <p style="margin-top:15px; font-size:0.8rem; text-align: center; text-transform: uppercase;">FRAME SELECTION:</p>
      ${framesHtml}
    `,
    showCancelButton: true,
    confirmButtonText: 'TO SET IT!',
    customClass: {popup: 'nfs-crt-modal'},
    didOpen: () => {
      const confirmBtn = Swal.getConfirmButton();
      if (confirmBtn) {
        confirmBtn.style.border = 'none';
        confirmBtn.style.boxShadow = '0 0 10px rgba(241, 196, 15, 0.5)';
      }
    },
    preConfirm: () => ({
      bio: document.getElementById('swal-bio').value,
      frame: window.tempSelectedFrame || window.profileData.selected_frame
    })
  });

  if (formValues) {
    const {error} = await _supabase.from('profiles').update({
      bio: formValues.bio,
      selected_frame: formValues.frame
    }).eq('id', window.currentUserId);
    if (!error) location.reload();
  }
};

window.selectFrame = (id) => {
  window.tempSelectedFrame = id;
  document.querySelectorAll('.frame-preview').forEach(el => el.style.border = '1px solid #333');
  document.getElementById(id).style.border = '2px solid var(--nfs-yellow)';
};

async function checkFriendshipStatus(targetUserId) {
  const btn = document.getElementById('friendBtn');
  const msgBtn = document.getElementById('msgBtn');

  if (!window.myProfile || targetUserId === window.myProfile.id) {
    if (btn) btn.classList.add('hidden');
    if (msgBtn) msgBtn.classList.add('hidden');
    return;
  }

  const {data: request} = await _supabase
    .from('friend_requests')
    .select('*')
    .or(`and(sender_id.eq.${window.myProfile.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${window.myProfile.id})`)
    .maybeSingle();

  if (!btn) return;

  btn.classList.remove('hidden');
  if (msgBtn) msgBtn.classList.remove('hidden');

  if (!request) {
    btn.innerText = "ADD TO FRIENDS";
    btn.style.background = "";
    btn.style.color = "";
    btn.style.border = "";
    btn.disabled = false;
    btn.onclick = () => sendFriendRequest(targetUserId);
  } else if (request.status === 'pending') {
    if (request.sender_id === window.myProfile.id) {
      btn.innerText = "THE REQUEST HAS BEEN SENT";
      btn.disabled = true;
    } else {
      btn.innerText = "ACCEPT THE REQUEST";
      btn.disabled = false;
      btn.onclick = () => acceptFriendRequest(request.id);
    }
  } else if (request.status === 'accepted') {
    btn.innerText = "REMOVE FROM FRIENDS";
    btn.style.background = "#e74c3c";
    btn.style.color = "#fff";
    btn.style.border = "2px solid #c0392b";
    btn.disabled = false;
    btn.onclick = () => removeFriend(request.id);
  }
}

async function sendFriendRequest(targetId) {
  await _supabase.from('friend_requests').insert([{
    sender_id: window.myProfile.id,
    receiver_id: targetId,
    sender_name: window.myProfile.username
  }]);
  location.reload();
}

async function acceptFriendRequest(requestId) {
  await _supabase.from('friend_requests').update({status: 'accepted'}).eq('id', requestId);
  location.reload();
}

async function removeFriend(requestId) {
  await _supabase.from('friend_requests').delete().eq('id', requestId);
  location.reload();
}

window.openMuteModal = async () => {
  if (!window.myProfile || !window.myProfile.is_admin || !window.profileData) return;
  const {value: minutes} = await Swal.fire({
    title: 'ВЫДАТЬ МУТ',
    input: 'select',
    inputOptions: {'15': '15 минут', '60': '1 час', '1440': '24 часа', '10080': '7 дней'},
    inputPlaceholder: 'Выберите срок наказания',
    showCancelButton: true,
    confirmButtonText: 'ЗАМУТИТЬ',
    customClass: {popup: 'nfs-crt-modal'}
  });

  if (minutes) {
    const mutedUntil = new Date(Date.now() + minutes * 60000).toISOString();
    const {error} = await _supabase.from('profiles').update({muted_until: mutedUntil}).eq('id', window.profileData.id);
    if (!error) {
      window.profileData.muted_until = mutedUntil;
      setTimeout(() => location.reload(), 1200);
    }
  }
};

async function checkDailyBonus(me) {
  if (!me) return;

  const today = new Date().toISOString().split('T')[0];

  // Якщо сьогодні бонус ще не отримували
  if (me.last_active_date !== today) {
    const bonus = me.is_vip ? 20 : 10;
    const currentRating = me.rating || 1000;
    const newRating = currentRating + bonus;

    // Розрахунок: 1000 = 1 level, кожні +200 rating = +1 level
    const newLevel = 1 + Math.floor((newRating - 1000) / 200);

    const {error} = await _supabase
      .from('profiles')
      .update({
        rating: newRating,
        level: newLevel,
        last_active_date: today
      })
      .eq('id', me.id);

    if (!error) {
      // Оновлюємо локальний об'єкт, щоб на екрані одразу були нові цифри
      me.rating = newRating;
      me.level = newLevel;
      me.last_active_date = today;

      // Сповіщення користувача
      Swal.fire({
        title: 'DAILY BONUS!',
        text: `+${bonus} RATING FOR DAILY ENTRY!`,
        icon: 'success',
        timer: 3000,
        showConfirmButton: false,
        customClass: {popup: 'nfs-crt-modal'}
      });
    }
  }
}

function setupProfileRealtimeListener() {
  if (!window.profileData) return;
  _supabase.removeChannel(_supabase.channel(`profile-db-changes-${window.profileData.id}`));
  _supabase.channel(`profile-db-changes-${window.profileData.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'profiles',
      filter: `id=eq.${window.profileData.id}`
    }, (payload) => {
      window.profileData = payload.new;
      const currentLocal = localStorage.getItem('driver_status') || 'ONLINE';
      if (window.myProfile && payload.new.id === window.myProfile.id) {
        window.profileData.status = currentLocal;
      }
      window.updateLiveStatusUI();
    })
    .subscribe();
}

function goToChat(username) {
  if (!username) return;
  window.location.href = `chats.html?to=${username}`;
}
