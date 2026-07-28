import { _supabase } from '../config.js';
import '../widgets.js';
import '../global.js';

window.myProfile = null;

// ==================== 1. ЛОГІКА КАЛЕНДАРЯ ====================
window.initCalendarHeader = function() {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const todayDate = now.getDate();

  // Заголовок місяця з підтримкою локалізації
  const calendarTitleEl = document.getElementById('calendarMonth') || document.querySelector('.calendar-title');
  if (calendarTitleEl) {
    const currentLang = localStorage.getItem('safehouse_lang') || 'en';
    if (currentLang === 'ua' && typeof translations !== 'undefined' && translations.ua) {
      calendarTitleEl.innerText = `${translations.ua.calendar_title || 'Calendar'} — ${monthNames[currentMonth]} ${currentYear}`;
    } else {
      calendarTitleEl.innerText = `${monthNames[currentMonth]} ${currentYear}`;
    }
  }

  // Розрахунок днів
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const startDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Початок тижня з понеділка
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Пошук елемента
  let calendarBody = document.getElementById('calendarBody');
  if (!calendarBody) {
    const table = document.querySelector('.calendar-table') || document.querySelector('.calendar block table') || document.querySelector('table');
    if (table) {
      calendarBody = table.querySelector('tbody') || table;
    }
  }

  if (!calendarBody) return;

  let html = '';
  let dayCount = 1;

  // Перший тиждень
  html += '<tr>';
  for (let i = 0; i < startDay; i++) {
    html += '<td></td>';
  }
  for (let i = startDay; i < 7; i++) {
    const isToday = dayCount === todayDate;
    const style = isToday ? 'color: var(--nfs-yellow, #f1c40f); font-weight: bold; background: rgba(241, 196, 15, 0.15);' : '';
    html += `<td class="${isToday ? 'u-today' : ''}" style="${style}">${dayCount}</td>`;
    dayCount++;
  }
  html += '</tr>';

  // Наступні тижні
  while (dayCount <= totalDays) {
    html += '<tr>';
    for (let i = 0; i < 7; i++) {
      if (dayCount <= totalDays) {
        const isToday = dayCount === todayDate;
        const style = isToday ? 'color: var(--nfs-yellow, #f1c40f); font-weight: bold; background: rgba(241, 196, 15, 0.15);' : '';
        html += `<td class="${isToday ? 'u-today' : ''}" style="${style}">${dayCount}</td>`;
        dayCount++;
      } else {
        html += '<td></td>';
      }
    }
    html += '</tr>';
  }

  calendarBody.innerHTML = html;
};

// ==================== 2. ЛОГІКА РАДАРА (LOOKING FOR GAME) ====================
window.scanForPlayers = async function() {
  let container = document.getElementById('radarList') ||
    document.getElementById('lfgList') ||
    document.querySelector('.radar-list');

  if (!container) {
    const allDivs = document.querySelectorAll('div, p, span');
    for (let el of allDivs) {
      if (el.children.length === 0 && el.innerText.includes('Signal scanning...')) {
        container = el.parentElement;
        break;
      }
    }
  }

  if (!container) return;

  let lfgRacers = [];

  // 1. Отримуємо гравців з Realtime Presence (window.onlineUsers)
  if (window.onlineUsers && Object.keys(window.onlineUsers).length > 0) {
    Object.keys(window.onlineUsers).forEach(username => {
      const presenceArray = window.onlineUsers[username];
      if (presenceArray && presenceArray[0]) {
        const pData = presenceArray[0];
        if (pData.status === 'LOOKING FOR GAME') {
          lfgRacers.push({
            username: pData.user || username,
            avatar_url: pData.avatar_url || ''
          });
        }
      }
    });
  }

  // 2. Якщо в Presence порожньо — робимо фолбек у базу Supabase
  if (lfgRacers.length === 0) {
    const { data } = await _supabase.from('profiles').select('*').ilike('status', 'LOOKING FOR GAME');
    if (data && data.length > 0) {
      lfgRacers = data;
    }
  }

  const currentLang = localStorage.getItem('safehouse_lang') || 'en';

  if (lfgRacers.length === 0) {
    const textEmpty = (typeof translations !== 'undefined' && translations[currentLang] && translations[currentLang]['radar_empty'])
      ? translations[currentLang]['radar_empty']
      : 'No active signals found...';
    container.innerHTML = `<p style="color:#666; font-size:0.85rem; padding: 5px 0; font-style:italic;">${textEmpty}</p>`;
    return;
  }

  container.innerHTML = '';
  lfgRacers.forEach(racer => {
    const isMe = window.myProfile && racer.username === window.myProfile.username;
    container.innerHTML += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${racer.avatar_url || 'https://via.placeholder.com/30'}" style="width:30px; height:30px; border: 1px solid var(--nfs-yellow, #f1c40f); object-fit:cover;">
          <span style="cursor:pointer; font-weight:bold; color:#fff;" onclick="window.location.href='profile.html?u=${racer.username}'">${racer.username}</span>
        </div>
        ${!isMe ? `<button class="nfs-font" style="background:transparent; border:1px solid var(--nfs-yellow, #f1c40f); color:var(--nfs-yellow, #f1c40f); padding:2px 8px; cursor:pointer; font-size:0.75rem;" onclick="window.location.href='chats.html?to=${racer.username}'">CHALLENGE</button>` : '<small style="color:var(--nfs-yellow, #f1c40f); font-weight:bold;">YOU</small>'}
      </div>`;
  });
};

// ==================== 3. ПОШУК ТА АВТОРИЗАЦІЯ ====================
window.performGlobalSearch = async function() {
  const input = document.getElementById('globalSearchInput') || document.querySelector('input[placeholder*="nickname"]');
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;

  const { data } = await _supabase.from('profiles').select('username').ilike('username', query).maybeSingle();
  if (data) {
    window.location.href = `profile.html?u=${data.username}`;
  } else {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'ERROR',
        text: 'The racer was not found',
        icon: 'error',
        customClass: { popup: 'nfs-crt-modal' }
      });
    } else {
      alert('The racer was not found');
    }
  }
};

function showLoggedIn(profile) {
  const loginBtn = document.getElementById('loginBtn');
  const userInfo = document.getElementById('userInfo');
  const nick = document.getElementById('displayNick');

  if (loginBtn) loginBtn.style.display = 'none';
  if (userInfo) userInfo.style.display = 'flex';
  if (nick) {
    nick.innerText = profile.username;
    if (profile.is_admin) nick.className = 'admin-glow';
  }
}

// ==================== 4. ІНІЦІАЛІЗАЦІЯ СТОРІНКИ ====================
const initPage = async () => {
  if (typeof applyLanguage === 'function') applyLanguage();
  window.initCalendarHeader();

  const { data: { user } } = await _supabase.auth.getUser();

  if (user) {
    window.currentUserId = user.id;
    const { data: profile } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
      window.myProfile = profile;

      const savedStatus = localStorage.getItem('driver_status') || profile.status || 'ONLINE';
      window.myProfile.status = savedStatus;

      showLoggedIn(profile);

      const notifyWrapper = document.getElementById('notifyWrapper');
      if (notifyWrapper) notifyWrapper.style.display = 'flex';

      if (typeof window.initGlobalStatus === 'function') {
        window.initGlobalStatus(_supabase, window.myProfile);
      }

      if (typeof window.updateGlobalMsgBadge === 'function') window.updateGlobalMsgBadge(_supabase, window.myProfile.id);
      if (typeof window.updateFriendNotifications === 'function') window.updateFriendNotifications();
      if (typeof window.checkAdminReplies === 'function') window.checkAdminReplies();

      // Realtime події для особистих повідомлень
      _supabase.channel('index-realtime')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `receiver_id=eq.${window.myProfile.id}`
        }, () => {
          if (typeof window.updateGlobalMsgBadge === 'function') window.updateGlobalMsgBadge(_supabase, window.myProfile.id);
          if (typeof window.playNotificationSound === 'function') window.playNotificationSound();
        })
        .subscribe();

      // Realtime події для тикетів підтримки
      _supabase.channel('support-realtime')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `user_id=eq.${window.myProfile.id}`
        }, (payload) => {
          if (typeof window.checkAdminReplies === 'function') window.checkAdminReplies();
          if (payload.new.status === 'resolved' && !payload.new.is_read) {
            if (typeof window.playNotificationSound === 'function') window.playNotificationSound();
          }
        })
        .subscribe();
    }
  } else {
    if (typeof window.initGlobalStatus === 'function') {
      window.initGlobalStatus(_supabase, null);
    }
  }

  await window.scanForPlayers();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

setTimeout(() => {
  window.initCalendarHeader();
  window.scanForPlayers();
}, 300);
