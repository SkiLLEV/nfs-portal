// Global radar object
let onlineUsers = {};

/**
 * 0. GLOBAL NOTIFICATION SOUND
 */
function playNotificationSound() {
  const audio = new Audio('https://codesandbox.io/api/v1/sandboxes/github/codesandbox/sandbox-template/files/contents/public/success.mp3');
  audio.volume = 0.6;
  audio.play().catch(err => console.log("Sound play prevented by browser autoplay policy"));
}

/**
 * 1. NFS Notifications
 */
function nfsNotify(title, icon = 'success') {
  if (typeof Swal === 'undefined') return;
  Swal.fire({
    title: title.toUpperCase(),
    icon: icon,
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    background: '#0a0a0a',
    color: '#cca609',
    iconColor: '#cca609',
    customClass: {popup: 'nfs-toast-border'}
  });
}

function formatLastSeen(dateString) {
  if (!dateString) return "a long time ago";

  const now = new Date();
  const lastSeen = new Date(dateString);
  const diffInSeconds = Math.floor((now - lastSeen) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min. ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} h. ago`;

  return lastSeen.toLocaleDateString('en-EN', {day: 'numeric', month: 'short'});
}

/**
 * 2. Message Badge Updater (Fetches raw state from DB without updating flags)
 */
async function updateGlobalMsgBadge(supabase, myId) {
  if (!supabase || !myId) return;

  const {count, error} = await supabase
    .from('direct_messages')
    .select('*', {count: 'exact', head: true})
    .eq('receiver_id', myId)
    .eq('is_read', false);

  const badge = document.getElementById('msgBadge');
  if (badge) {
    if (!error && count > 0) {
      badge.innerText = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * 3. Safe message marker (Marks read only when explicitly inside the specific chat block)
 */
async function markChatAsRead(supabase, myId, senderId) {
  if (!supabase || !myId || !senderId) return;
  await supabase
    .from('direct_messages')
    .update({is_read: true})
    .eq('receiver_id', myId)
    .eq('sender_id', senderId)
    .eq('is_read', false);

  await updateGlobalMsgBadge(supabase, myId);
}

/**
 * 4. GLOBAL BEACON (initGlobalStatus)
 */
async function initGlobalStatus(supabase, profile) {
  if (!supabase) return;

  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  // Create Realtime presence channel
  const statusChannel = supabase.channel('global-online', {
    config: {
      presence: {
        key: profile ? profile.username : 'guest_' + Math.random().toString(36).substr(2, 5)
      }
    }
  });

  // --- STEP 1: HANDLERS (Radar sync) ---
  statusChannel.on('presence', {event: 'sync'}, () => {
    onlineUsers = statusChannel.presenceState();

    const footerOnline = document.getElementById('footerOnline');
    if (footerOnline) footerOnline.innerText = Object.keys(onlineUsers).length;

    if (typeof window.updateFriendsStatusOnly === 'function') window.updateFriendsStatusOnly();
    if (typeof window.updateLiveStatusUI === 'function') window.updateLiveStatusUI();
    if (typeof window.updateSteamFriendsWidgetOnly === 'function') window.updateSteamFriendsWidgetOnly();
  });

  // Global status tracking broadcaster (Проверяет локальную память)
  window.trackMyStatus = async (newStatus) => {
    if (!profile) return;
    const savedStatus = localStorage.getItem('driver_status') || profile.status || 'ONLINE';
    await statusChannel.track({
      user: profile.username,
      location: currentPage,
      status: newStatus || savedStatus
    });
  };

  if (profile) {
    // Если в адресе страницы есть "topic.html", виджет просто не будет создаваться
    if (!window.location.pathname.includes('topic.html')) {
      injectSteamFriendsWidget(supabase, profile);
    }
  }
  // --- STEP 2: SUBSCRIPTION & LAST SEEN UPDATES ---
  statusChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED' && profile) {
      // Подтягиваем сохранённый статус, чтобы утилиты не затирали его при переходе на новую страницу
      const savedStatus = localStorage.getItem('driver_status') || 'ONLINE';
      profile.status = savedStatus;

      await window.trackMyStatus(savedStatus);

      const now = new Date().toISOString();
      await supabase
        .from('profiles')
        .update({status: savedStatus, last_seen: now})
        .eq('id', profile.id);

      await updateGlobalMsgBadge(supabase, profile.id);
    }
  });

  // --- STEP 2.5: Realtime direct message interceptor ---
  if (profile) {
    supabase.channel('global-audio-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`
      }, (payload) => {
        playNotificationSound();
        updateGlobalMsgBadge(supabase, profile.id);

        if (currentPage === 'chats.html' && typeof window.loadRecentDMs === 'function') {
          window.loadRecentDMs();
        }
      })
      .subscribe();
  }

  // --- STEP 3: VISIBILITY/OFFLINE MANAGEMENT (Исправлено!) ---
  if (profile) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const savedStatus = localStorage.getItem('driver_status') || 'ONLINE';
        if (savedStatus !== 'LOOKING FOR GAME') {
          const now = new Date().toISOString();
          supabase
            .from('profiles')
            .update({status: 'OFFLINE', last_seen: now})
            .eq('id', profile.id)
            .then();
        }
      }
    });
  }

  /**
   * 5. STEAM OVERLAY LOOKALIKE FRIENDS WIDGET
   */
  function injectSteamFriendsWidget(supabaseClient, myProfile) {
    if (!supabaseClient || !myProfile) return;
    if (document.getElementById('steamFriendsWin')) return;

    const style = document.createElement('style');
    style.innerHTML = `
      .steam-friends-toggle-btn {
        position: fixed;
        bottom: 55px;
        right: 20px;
        background: #0a0a0a;
        color: #96a6b6;
        border: 1px solid #cca609;
        padding: 4px 12px;
        font-size: 0.75rem;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        cursor: pointer;
        z-index: 2001;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
        transition: 0.2s;

        /* ВЫРАВНИВАНИЕ ИКОНКИ И ТЕКСТА ПО СКЕТЧУ */
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .steam-friends-window {
        display: none;
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 280px;
        height: 380px;
        background: #0a0a0a;
        border: 1px solid #cca609;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8);
        z-index: 2000;
        font-family: 'Segoe UI', Arial, sans-serif;
        display: flex;
        flex-direction: column;
      }

      .steam-friends-header {
        background: #171a21;
        padding: 10px 15px;
        font-size: 0.8rem;
        font-weight: bold;
        color: #fff;
        letter-spacing: 1px;
        text-transform: uppercase;
        border-bottom: 1px solid #233c51;
      }

      .steam-friends-body {
        flex-grow: 1;
        overflow-y: auto;
        padding: 10px 15px;
      }

      .steam-cat-title {
        font-size: 0.75rem;
        color: #67c1f5;
        margin: 15px 0 8px 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .steam-cat-title:first-child { margin-top: 0; }

      .steam-friend-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 0;
        cursor: pointer;
        transition: 0.1s;
      }
      .steam-friend-row:hover { background: rgba(255, 255, 255, 0.03); }

      .steam-friend-avatar {
        width: 34px;
        height: 34px;
        object-fit: cover;
        border: 2px solid #555;
      }

      .steam-border-online { border-color: #57cbde !important; }
      .steam-border-ingame { border-color: #90ba3c !important; }
      .steam-border-offline { border-color: rgba(255,255,255,0.1) !important; }

      .steam-friend-info {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
        overflow: hidden;
      }

      .steam-friend-name {
        font-size: 0.85rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .steam-text-online { color: #57cbde; }
      .steam-text-ingame { color: #90ba3c; }
      .steam-text-offline { color: #8f98a0; }
      .steam-friend-status-text { font-size: 0.7rem; }
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.className = 'steam-friends-toggle-btn';
    // Добавляем иконку силуэта перед текстом по наброску
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display: inline-block;">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
      <span>Friends</span>
    `;

    btn.onclick = () => {
      const win = document.getElementById('steamFriendsWin');
      if (win) {
        const isHidden = win.style.display === 'none' || win.style.display === '';
        win.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) refreshSteamFriendsList(supabaseClient, myProfile);
      }
    };

    const win = document.createElement('div');
    win.id = 'steamFriendsWin';
    win.className = 'steam-friends-window';
    win.style.display = 'none';
    win.innerHTML = `
      <div class="steam-friends-header">Friends</div>
      <div class="steam-friends-body" id="steamFriendsBody">
        <p style="color:#555; font-size:0.8rem; text-align:center; margin-top:20px;">Loading...</p>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(win);

    refreshSteamFriendsList(supabaseClient, myProfile);
  }

  async function refreshSteamFriendsList(supabaseClient, myProfile) {
    const body = document.getElementById('steamFriendsBody');
    if (!body) return;

    const {data: friendships} = await supabaseClient.from('friend_requests')
      .select('*')
      .eq('status', 'accepted')
      .or(`sender_id.eq.${myProfile.id},receiver_id.eq.${myProfile.id}`);

    if (!friendships || friendships.length === 0) {
      body.innerHTML = '<p style="color: #555; font-size: 0.8rem; text-align: center; margin-top: 20px; font-style: italic;">No friends added yet.</p>';
      return;
    }

    const friendIds = friendships.map(f => f.sender_id === myProfile.id ? f.receiver_id : f.sender_id);

    const {data: profiles} = await supabaseClient.from('profiles')
      .select('id, username, avatar_url, status, last_seen')
      .in('id', friendIds);

    if (!profiles) return;

    let playingHTML = '';
    let onlineHTML = '';
    let offlineHTML = '';

    let playingCount = 0;
    let onlineCount = 0;
    let offlineCount = 0;

    profiles.forEach(friend => {
      const presence = (typeof onlineUsers !== 'undefined' && onlineUsers[friend.username]) ? onlineUsers[friend.username] : null;

      let isOnline = !!presence;
      let dotColorClass = 'steam-text-offline';
      let borderClass = 'steam-border-offline';

      if (isOnline) {
        const pData = presence[0];
        const liveStatus = pData.status || 'ONLINE';
        const avatarSrc = friend.avatar_url || 'https://via.placeholder.com/34';

        if (liveStatus === 'IN GAME' || liveStatus === 'IN-GAME' || liveStatus === 'LOOKING FOR GAME' || pData.location === 'chats.html') {
          playingCount++;
          dotColorClass = 'steam-text-ingame';
          borderClass = 'steam-border-ingame';

          let statusText = 'IN-GAME';
          if (liveStatus === 'LOOKING FOR GAME') statusText = 'LOOKING FOR GAME';
          if (pData.location === 'chats.html') statusText = 'IN CHAT';

          playingHTML += `
            <div class="steam-friend-row" onclick="window.location.href='profile.html?u=${friend.username}'">
              <img src="${avatarSrc}" class="steam-friend-avatar ${borderClass}">
              <div class="steam-friend-info">
                <span class="steam-friend-name ${dotColorClass}">${friend.username}</span>
                <span class="steam-friend-status-text ${dotColorClass}">${statusText}</span>
              </div>
            </div>
          `;
        } else {
          onlineCount++;
          dotColorClass = 'steam-text-online';
          borderClass = 'steam-border-online';

          onlineHTML += `
            <div class="steam-friend-row" onclick="window.location.href='profile.html?u=${friend.username}'">
              <img src="${avatarSrc}" class="steam-friend-avatar ${borderClass}">
              <div class="steam-friend-info">
                <span class="steam-friend-name ${dotColorClass}">${friend.username}</span>
                <span class="steam-friend-status-text ${dotColorClass}">Online</span>
              </div>
            </div>
          `;
        }
      } else {
        offlineCount++;
        let lastSeenText = "Last online long ago";
        if (friend.last_seen) {
          lastSeenText = `Last online ${formatLastSeen(friend.last_seen)}`;
        }

        const avatarSrc = friend.avatar_url || 'https://via.placeholder.com/34';

        offlineHTML += `
          <div class="steam-friend-row" onclick="window.location.href='profile.html?u=${friend.username}'" style="opacity: 0.6;">
            <img src="${avatarSrc}" class="steam-friend-avatar ${borderClass}">
            <div class="steam-friend-info">
              <span class="steam-friend-name ${dotColorClass}">${friend.username}</span>
              <span class="steam-friend-status-text ${dotColorClass}">${lastSeenText}</span>
            </div>
          </div>
        `;
      }
    });

    let finalHTML = '';

    if (playingCount > 0) {
      finalHTML += `
        <div class="steam-cat-title" style="color: #90ba3c;">Playing (${playingCount})</div>
        ${playingHTML}
      `;
    }

    finalHTML += `
      <div class="steam-cat-title" style="${playingCount > 0 ? 'margin-top:20px;' : ''}">Online Friends (${onlineCount})</div>
      ${onlineHTML || '<p style="color:#444; font-size:0.75rem; margin-left:5px;">There is no one online</p>'}

      <div class="steam-cat-title" style="margin-top:20px;">Offline (${offlineCount})</div>
      ${offlineHTML || '<p style="color:#444; font-size:0.75rem; margin-left:5px;">The list is empty</p>'}
    `;

    body.innerHTML = finalHTML;
  }

  window.updateSteamFriendsWidgetOnly = function () {
    const win = document.getElementById('steamFriendsWin');
    if (win && win.style.display === 'flex') {
      refreshSteamFriendsList(supabase, profile);
    }
  };

  /**
   * GLOBAL SWEETALERT AUTHORIZATION
   */
  async function openModal() {
    const {value: formValues} = await Swal.fire({
      title: 'RACE AUTHORIZATION',
      background: '#0a0a0a', color: '#fff',
      html: `
          <input id="swal-email" class="swal2-input" placeholder="Email" type="email" style="background:#111; color:#fff;">
          <input id="swal-password" class="swal2-input" placeholder="Password" type="password" style="background:#111; color:#fff;">
        `,
      focusConfirm: false,
      preConfirm: () => {
        return {
          email: document.getElementById('swal-email').value.trim(),
          password: document.getElementById('swal-password').value.trim()
        }
      }
    });

    if (formValues) {
      const {error} = await supabase.auth.signInWithPassword({
        email: formValues.email,
        password: formValues.password,
      });

      if (error) {
        Swal.fire({icon: 'error', title: 'ERROR', text: error.message, background: '#0a0a0a', color: '#fff'});
      } else {
        nfsNotify('Welcome back to Rockport!');
        setTimeout(() => location.reload(), 1000);
      }
    }
  }

  window.openModal = openModal;
}
