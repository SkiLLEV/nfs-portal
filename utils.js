// Глобальный объект радара
let onlineUsers = {};

/**
 * 0. ГЛОБАЛЬНЫЙ ЗВУК УВЕДОМЛЕНИЯ
 */
function playNotificationSound() {
  const audio = new Audio('https://codesandbox.io/api/v1/sandboxes/github/codesandbox/sandbox-template/files/contents/public/success.mp3');
  audio.volume = 0.6;

  audio.play().catch(err => {
    console.log("Браузер ждет клика по странице для активации звука:", err);
  });
}

/**
 * 1. Уведомления NFS
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
    color: '#f1c40f',
    iconColor: '#f1c40f',
    customClass: { popup: 'nfs-toast-border' }
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

  return lastSeen.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * 2. Счетчик сообщений
 */
async function updateGlobalMsgBadge(supabase, myId) {
  if (!supabase || !myId) return;
  const { count, error } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
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
 * 3. Пометка прочитанных
 */
async function markAllMsgsAsRead(supabase, myId) {
  if (!supabase || !myId) return;
  const { error } = await supabase
    .from('direct_messages')
    .update({ is_read: true })
    .eq('receiver_id', myId)
    .eq('is_read', false);

  if (!error) {
    const badge = document.getElementById('msgBadge');
    if (badge) badge.style.display = 'none';
  }
}

/**
 * 4. ГЛОБАЛЬНЫЙ МАЯК (initGlobalStatus)
 */
async function initGlobalStatus(supabase, profile) {
  if (!supabase) return;

  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  // Создаем канал для Realtime присутствия
  const statusChannel = supabase.channel('global-online', {
    config: {
      presence: {
        key: profile ? profile.username : 'guest_' + Math.random().toString(36).substr(2, 5)
      }
    }
  });

  // --- ШАГ 1: ОБРАБОТЧИКИ (Синхронизация радара) ---
  statusChannel.on('presence', { event: 'sync' }, () => {
    onlineUsers = statusChannel.presenceState();

    const footerOnline = document.getElementById('footerOnline');
    if (footerOnline) footerOnline.innerText = Object.keys(onlineUsers).length;

    if (typeof window.updateFriendsStatusOnly === 'function') window.updateFriendsStatusOnly();
    if (typeof window.updateLiveStatusUI === 'function') window.updateLiveStatusUI();
    if (typeof window.updateSteamFriendsWidgetOnly === 'function') window.updateSteamFriendsWidgetOnly();
  });

  // Глобальная функция для обновления статуса в радаре
  window.trackMyStatus = async (newStatus) => {
    if (!profile) return;
    await statusChannel.track({
      user: profile.username,
      location: currentPage,
      status: newStatus || profile.status || 'ONLINE'
    });
  };

  // Включаем оверлей друзей, если профиль авторизован
  if (profile) {
    injectSteamFriendsWidget(supabase, profile);
  }

  // --- ШАГ 2: ПОДПИСКА И ОБНОВЛЕНИЕ ВРЕМЕНИ ---
  statusChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED' && profile) {
      await window.trackMyStatus();

      const now = new Date().toISOString();
      await supabase
        .from('profiles')
        .update({ last_seen: now })
        .eq('id', profile.id);
    }
  });

  // --- ШАГ 2.5: 🔔 ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК СООБЩЕНИЙ СО ЗВУКОМ ---
  if (profile) {
    supabase.removeChannel(supabase.channel('global-audio-messages'));

    supabase.channel('global-audio-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.'${profile.id}'`
      }, (payload) => {
        console.log("🔊 Глобальный Realtime перехватил сообщение:", payload);

        playNotificationSound();
        updateGlobalMsgBadge(supabase, profile.id);

        if (currentPage === 'chats.html' && typeof window.loadMyChatsList === 'function') {
          window.loadMyChatsList();
        }
      })
      .subscribe((status) => {
        console.log(`Статус аудио-канала для ${profile.username}:`, status);
      });
  }

  // --- ШАГ 3: ОБРАБОТКА ВЫХОДА (OFFLINE) ---
  if (profile) {
    window.addEventListener('beforeunload', () => {
      const now = new Date().toISOString();
      supabase
        .from('profiles')
        .update({ status: 'OFFLINE', last_seen: now })
        .eq('id', profile.id);
    });
  }

  /**
   * 5. СТИЛЬНЫЙ ВИДЖЕТ ДРУЗЕЙ В СТИЛЕ STEAM OVERLAY (Внутри маяка, чтобы видеть supabase и profile)
   */
  function injectSteamFriendsWidget(supabaseClient, myProfile) {
    if (!supabaseClient || !myProfile) return;

    // Проверяем, чтобы кнопка не создавалась по сто раз при переходах
    if (document.getElementById('steamFriendsWin')) return;

    const style = document.createElement('style');
    style.innerHTML = `
      .steam-friends-toggle-btn {
        position: fixed;
        bottom: 55px;
        right: 20px;
        background: #0a0a0a;
        color: #96a6b6;
        border: 1px solid #f1c40f;
        padding: 4px 12px;
        font-size: 0.75rem;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        cursor: pointer;
        z-index: 2001;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
        transition: 0.2s;
      }
      .steam-friends-toggle-btn:hover {
        color: #fff;
        background: #2a475e;
        box-shadow: 0 0 10px #f1c40f;
      }

      .steam-friends-window {
        display: none;
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 280px;
        height: 380px;
        background: #0a0a0a;
        border: 1px solid #f1c40f;
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
    btn.innerText = 'Friends';
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

  /**
   * Логика получения друзей из базы и разделения их на Playing, Online и Offline
   */
  async function refreshSteamFriendsList(supabaseClient, myProfile) {
    const body = document.getElementById('steamFriendsBody');
    if (!body) return;

    // Тянем только подтвержденных друзей
    const { data: friendships } = await supabaseClient.from('friend_requests')
      .select('*')
      .eq('status', 'accepted')
      .or(`sender_id.eq.${myProfile.id},receiver_id.eq.${myProfile.id}`);

    if (!friendships || friendships.length === 0) {
      body.innerHTML = '<p style="color: #555; font-size: 0.8rem; text-align: center; margin-top: 20px; font-style: italic;">No friends added yet.</p>';
      return;
    }

    const friendIds = friendships.map(f => f.sender_id === myProfile.id ? f.receiver_id : f.sender_id);

    // Загружаем профили друзей и их точное время из базы
    const { data: profiles } = await supabaseClient.from('profiles')
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
        const avatarSrc = friend.avatar_url || 'https://cs9.pikabu.ru/post_img/2017/02/16/9/1487255861137287071.png';

        // 🌟 ВАРИАНТ 1: ДРУГ ИГРАЕТ ИЛИ ИЩЕТ ИГРУ (Уходит в категорию PLAYING)
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
        }
        // 🌟 ВАРИАНТ 2: ДРУГ ПРОСТО НА САЙТЕ (Уходит в категорию ONLINE FRIENDS)
        else {
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
        // 🌟 ВАРИАНТ 3: ДРУГ ОФФЛАЙН (Уходит в категорию OFFLINE)
        offlineCount++;
        let lastSeenText = "Last online long ago";
        if (friend.last_seen) {
          lastSeenText = `Last online ${formatLastSeen(friend.last_seen)}`;
        }

        const avatarSrc = friend.avatar_url || 'https://cs9.pikabu.ru/post_img/2017/02/16/9/1487255861137287071.png';

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

    // Собираем весь HTML-код. Категория Playing рендерится только если в ней КТО-ТО ЕСТЬ!
    let finalHTML = '';

    if (playingCount > 0) {
      finalHTML += `
        <div class="steam-cat-title" style="color: #90ba3c;">Playing (${playingCount})</div>
        ${playingHTML}
      `;
    }

    finalHTML += `
      <div class="steam-cat-title" style="${playingCount > 0 ? 'margin-top:20px;' : ''}">Online Friends (${onlineCount})</div>
      ${onlineHTML || '<p style="color:#444; font-size:0.75rem; margin-left:5px;">Никого нет в сети</p>'}

      <div class="steam-cat-title" style="margin-top:20px;">Offline (${offlineCount})</div>
      ${offlineHTML || '<p style="color:#444; font-size:0.75rem; margin-left:5px;">Список пуст</p>'}
    `;

    body.innerHTML = finalHTML;
  }

    body.innerHTML = `
      <div class="steam-cat-title">Online Friends (${onlineCount})</div>
      ${onlineHTML || '<p style="color:#444; font-size:0.75rem; margin-left:5px;">Никого нет в сети</p>'}

      <div class="steam-cat-title" style="margin-top:20px;">Offline (${offlineCount})</div>
      ${offlineHTML || '<p style="color:#444; font-size:0.75rem; margin-left:5px;">Список пуст</p>'}
    `;

  // Привязываем внутреннюю функцию регенерации к глобальному триггеру
  window.updateSteamFriendsWidgetOnly = function() {
    const win = document.getElementById('steamFriendsWin');
    if (win && win.style.display === 'flex') {
      refreshSteamFriendsList(supabase, profile);
    }
  };
}
