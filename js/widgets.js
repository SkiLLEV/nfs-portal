// js/widgets.js

// Глобальный объект для хранения пользователей онлайн
window.onlineUsers = {};

window.formatLastSeen = function(dateString) {
  if (!dateString) return "a long time ago";

  const now = new Date();
  const lastSeen = new Date(dateString);
  const diffInSeconds = Math.floor((now - lastSeen) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min. ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} h. ago`;

  return lastSeen.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

/**
 * Инициализация онлайн-статуса и глобальных каналов
 */
window.initGlobalStatus = async function(supabaseClient, profile) {
  if (!supabaseClient) return;

  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  const statusChannel = supabaseClient.channel('global-online', {
    config: {
      presence: {
        key: profile ? profile.username : 'guest_' + Math.random().toString(36).substr(2, 5)
      }
    }
  });

  statusChannel.on('presence', { event: 'sync' }, () => {
    window.onlineUsers = statusChannel.presenceState();

    const footerOnline = document.getElementById('footerOnline');
    if (footerOnline) footerOnline.innerText = Object.keys(window.onlineUsers).length;

    let inRaceCount = 0;
    Object.values(window.onlineUsers).forEach(presenceArray => {
      const pData = presenceArray[0];
      if (pData && (pData.status === 'LOOKING FOR GAME' || pData.status === 'IN-GAME')) {
        inRaceCount++;
      }
    });

    const footerPlaying = document.getElementById('footerPlaying');
    if (footerPlaying) footerPlaying.innerText = inRaceCount;

    if (typeof window.updateFriendsStatusOnly === 'function') window.updateFriendsStatusOnly();
    if (typeof window.updateLiveStatusUI === 'function') window.updateLiveStatusUI();
    if (typeof window.updateSteamFriendsWidgetOnly === 'function') window.updateSteamFriendsWidgetOnly();
  });

  window.trackMyStatus = async (newStatus) => {
    if (!profile) return;

    if (newStatus) {
      localStorage.setItem('driver_status', newStatus);
    }

    const currentStatus = newStatus || localStorage.getItem('driver_status') || profile.status || 'ONLINE';

    await statusChannel.track({
      user: profile.username,
      avatar_url: profile.avatar_url,
      location: currentPage,
      status: currentStatus
    });
  };

  if (profile) {
    const isChatPage = window.location.pathname.includes('chats.html');
    const isTopicPage = window.location.pathname.includes('topic.html');

    if (!isChatPage && !isTopicPage) {
      injectSteamFriendsWidget(supabaseClient, profile);
    }
  }

  statusChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED' && profile) {
      const savedStatus = localStorage.getItem('driver_status') || 'ONLINE';
      profile.status = savedStatus;

      await window.trackMyStatus(savedStatus);

      const now = new Date().toISOString();
      await supabaseClient
        .from('profiles')
        .update({ status: savedStatus, last_seen: now })
        .eq('id', profile.id);

      if (typeof window.updateGlobalMsgBadge === 'function') {
        await window.updateGlobalMsgBadge(supabaseClient, profile.id);
      }
    }
  });

  if (profile) {
    supabaseClient.channel('global-audio-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`
      }, () => {
        if (typeof window.playNotificationSound === 'function') window.playNotificationSound();
        if (typeof window.updateGlobalMsgBadge === 'function') window.updateGlobalMsgBadge(supabaseClient, profile.id);

        if (currentPage === 'chats.html' && typeof window.loadRecentDMs === 'function') {
          window.loadRecentDMs();
        }
      })
      .subscribe();
  }

  // Перехват новостей от Davenport
  supabaseClient.channel('global-announcements')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'forum_topics'
    }, async (payload) => {
      const newTopic = payload.new;

      if (newTopic.author_name === 'Davenport') {
        const oldBanner = document.getElementById('nfsGlobalTopBanner');
        if (oldBanner) oldBanner.remove();

        const banner = document.createElement('div');
        banner.id = 'nfsGlobalTopBanner';
        banner.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100%;
          background: linear-gradient(180deg, #111113 0%, #050506 100%);
          border-bottom: 2px solid var(--nfs-yellow, #f1c40f);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.8); color: #fff;
          z-index: 99999; padding: 10px 20px; box-sizing: border-box;
          display: flex; justify-content: space-between; align-items: center;
          font-family: 'Courier New', Courier, monospace; font-size: 0.9rem;
          animation: slideDownNfsBanner 0.4s ease-out forwards;
        `;

        banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-right: 20px;">
          <div style="position: relative; width: 10px; height: 10px; flex-shrink: 0; display: inline-block;">
            <span class="nfs-live-dot" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #ff3333; border-radius: 50%; will-change: opacity; animation: nfsPulseRed 0.8s infinite alternate; z-index: 2;"></span>
            <span class="nfs-live-dot" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #ff3333; border-radius: 50%; filter: blur(4px); will-change: opacity; animation: nfsPulseRed 0.8s infinite alternate; z-index: 1;"></span>
          </div>

          <span class="nfs-font" style="color: var(--nfs-yellow, #f1c40f); font-weight: bold; letter-spacing: 1px; flex-shrink: 0;">
            NEWS:
          </span>
          <span style="font-weight: bold; color: #fff;">${newTopic.title}</span>
          <span style="color: #aaa; text-overflow: ellipsis; overflow: hidden;">— ${newTopic.content.substring(0, 100)}${newTopic.content.length > 100 ? '...' : ''}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 15px; flex-shrink: 0;">
          <a href="topic.html?id=${newTopic.id}" class="nfs-font" style="color: var(--nfs-yellow, #f1c40f); text-decoration: none; font-weight: bold; font-size: 0.8rem; border: 1px solid var(--nfs-yellow, #f1c40f); padding: 4px 10px; transition: 0.2s;" onmouseover="this.style.background='var(--nfs-yellow, #f1c40f)'; this.style.color='#000';" onmouseout="this.style.background='transparent'; this.style.color='var(--nfs-yellow, #f1c40f)';">
            OPEN
          </a>
          <span onclick="document.getElementById('nfsGlobalTopBanner').remove()" style="color: #ff4444; cursor: pointer; font-weight: bold; font-size: 1.1rem; padding: 0 5px;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#ff4444'">
            ×
          </span>
        </div>
      `;

        if (!document.getElementById('nfsBannerAnimation')) {
          const style = document.createElement('style');
          style.id = 'nfsBannerAnimation';
          style.innerHTML = `
          @keyframes slideDownNfsBanner { from { transform: translateY(-100%); } to { transform: translateY(0); } }
          @keyframes nfsPulseRed { from { opacity: 0.2; } to { opacity: 1; } }
          body { transition: padding-top 0.4s ease-out; }
        `;
          document.head.appendChild(style);
        }

        document.body.appendChild(banner);
      }
    })
    .subscribe();

  if (profile) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const savedStatus = localStorage.getItem('driver_status') || 'ONLINE';
        if (savedStatus !== 'LOOKING FOR GAME') {
          const now = new Date().toISOString();
          supabaseClient
            .from('profiles')
            .update({ status: 'OFFLINE', last_seen: now })
            .eq('id', profile.id)
            .then();
        }
      }
    });
  }
};

/**
 * Виджет друзей Steam
 */
function injectSteamFriendsWidget(supabaseClient, myProfile) {
  if (!supabaseClient || !myProfile) return;
  if (document.getElementById('steamFriendsWin')) return;

  const style = document.createElement('style');
  style.innerHTML = `
    .steam-friends-toggle-btn {
      position: fixed; bottom: 55px; right: 20px; background: #0a0a0a; color: #96a6b6;
      border: 1px solid #cca609; padding: 4px 12px; font-size: 0.75rem; font-weight: bold;
      text-transform: uppercase; letter-spacing: 1px; cursor: pointer; z-index: 2001;
      box-shadow: 0 0 10px rgba(0,0,0,0.5); transition: 0.2s; display: inline-flex; align-items: center; gap: 6px;
    }
    .steam-friends-window {
      display: none; position: fixed; bottom: 90px; right: 20px; width: 280px; height: 380px;
      background: #0a0a0a; border: 1px solid #cca609; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
      z-index: 2000; font-family: 'Segoe UI', Arial, sans-serif; display: flex; flex-direction: column;
    }
    .steam-friends-header {
      background: #171a21; padding: 10px 15px; font-size: 0.8rem; font-weight: bold;
      color: #fff; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #233c51;
    }
    .steam-friends-body { flex-grow: 1; overflow-y: auto; padding: 10px 15px; }
    .steam-cat-title { font-size: 0.75rem; color: #67c1f5; margin: 15px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .steam-cat-title:first-child { margin-top: 0; }
    .steam-friend-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; cursor: pointer; transition: 0.1s; }
    .steam-friend-row:hover { background: rgba(255, 255, 255, 0.03); }
    .steam-friend-avatar { width: 34px; height: 34px; object-fit: cover; border: 2px solid #555; }
    .steam-border-online { border-color: #57cbde !important; }
    .steam-border-ingame { border-color: #90ba3c !important; }
    .steam-border-offline { border-color: rgba(255,255,255,0.1) !important; }
    .steam-friend-info { display: flex; flex-direction: column; line-height: 1.2; overflow: hidden; }
    .steam-friend-name { font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .steam-text-online { color: #57cbde; }
    .steam-text-ingame { color: #90ba3c; }
    .steam-text-offline { color: #8f98a0; }
    .steam-friend-status-text { font-size: 0.7rem; }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'steam-friends-toggle-btn';
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

  const { data: friendships } = await supabaseClient.from('notifications')
    .select('*')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${myProfile.id},receiver_id.eq.${myProfile.id}`);

  if (!friendships || friendships.length === 0) {
    body.innerHTML = '<p style="color: #555; font-size: 0.8rem; text-align: center; margin-top: 20px; font-style: italic;">No friends added yet.</p>';
    return;
  }

  const friendIds = friendships.map(f => f.sender_id === myProfile.id ? f.receiver_id : f.sender_id);

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
    const presence = (typeof window.onlineUsers !== 'undefined' && window.onlineUsers[friend.username]) ? window.onlineUsers[friend.username] : null;

    let isOnline = !!presence;
    let dotColorClass = 'steam-text-offline';
    let borderClass = 'steam-border-offline';

    if (isOnline) {
      const pData = presence[0];
      const liveStatus = pData.status || 'ONLINE';
      const avatarSrc = friend.avatar_url || 'https://via.placeholder.com/34';

      if (liveStatus === 'IN-GAME' || liveStatus === 'LOOKING FOR GAME' || pData.location === 'chats.html') {
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
      if (friend.last_seen && typeof window.formatLastSeen === 'function') {
        lastSeenText = `Last online ${window.formatLastSeen(friend.last_seen)}`;
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
  if (win && win.style.display === 'flex' && typeof _supabase !== 'undefined' && typeof window.myProfile !== 'undefined') {
    refreshSteamFriendsList(_supabase, window.myProfile);
  }
};
