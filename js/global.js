// js/global.js
import { _supabase } from './config.js';

window.currentActiveTicketId = null;

/**
 * Обновление счетчика непрочитанных сообщений
 */
window.updateGlobalMsgBadge = async function(supabaseClient, myId) {
  const client = supabaseClient || _supabase;
  if (!client || !myId) return;

  const { count, error } = await client
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
};

/**
 * Выход из аккаунта
 */
window.handleLogout = async function() {
  const user = window.myProfile || window.currentUserId;
  const userId = typeof user === 'object' ? user?.id : user;

  if (userId && typeof _supabase !== 'undefined') {
    await _supabase.from('profiles').update({ status: 'OFFLINE' }).eq('id', userId);
  }
  if (typeof _supabase !== 'undefined') {
    await _supabase.auth.signOut();
  }
  window.location.href = 'auth.html';
};

/**
 * Переключение выпадающего списка уведомлений
 */
window.toggleNotifyPopup = function() {
  const p = document.getElementById('notifyPopup');
  if (p) p.style.display = p.style.display === 'block' ? 'none' : 'block';
};

/**
 * Обновление уведомлений о заявках в друзья
 */
window.updateFriendNotifications = async function() {
  const profile = window.myProfile || (window.currentUserId ? { id: window.currentUserId } : null);
  if (!profile || typeof _supabase === 'undefined') return;

  const { data: requests } = await _supabase
    .from('friend_requests')
    .select('*')
    .eq('receiver_id', profile.id)
    .eq('status', 'pending');

  const countEl = document.getElementById('notifyCount');
  const listEl = document.getElementById('notifyList');
  if (!countEl || !listEl) return;

  const currentLang = localStorage.getItem('safehouse_lang') || 'en';

  if (requests && requests.length > 0) {
    countEl.innerText = requests.length;
    countEl.style.display = 'flex';
    listEl.innerHTML = '';
    requests.forEach(req => {
      const textWants = (typeof translations !== 'undefined') ? translations[currentLang]['wants_friends'] : 'wants to be friends';
      listEl.innerHTML += `
        <div class="notify-item" style="padding:10px; border-bottom:1px solid #222; color:#fff; font-size:0.8rem;">
          <b>${req.sender_name}</b> ${textWants}
          <div class="notify-btns" style="display:flex; gap:5px; margin-top:5px;">
            <button class="btn-acc" onclick="respondFriend('${req.id}', 'accepted')" style="flex:1; background:#f1c40f; border:none; cursor:pointer; font-weight:bold; font-size:10px;">OK</button>
            <button class="btn-rej" onclick="respondFriend('${req.id}', 'rejected')" style="flex:1; background:#333; color:#fff; border:none; cursor:pointer; font-size:10px;">NO</button>
          </div>
        </div>`;
    });
  } else {
    countEl.style.display = 'none';
    const textNoReq = (typeof translations !== 'undefined') ? translations[currentLang]['no_requests'] : 'There are no requests';
    listEl.innerHTML = `<div style="padding:10px; font-size:10px; color:#444; text-align:center;">${textNoReq}</div>`;
  }
};

/**
 * Ответ на заявку в друзья
 */
window.respondFriend = async function(reqId, status) {
  if (typeof _supabase === 'undefined') return;
  try {
    if (status === 'accepted') {
      await _supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', reqId);
    } else {
      await _supabase.from('friend_requests').delete().eq('id', reqId);
    }
    await window.updateFriendNotifications();
  } catch (err) {
    console.error(err);
  }
};

/**
 * Логика работы модалки саппорта
 */
window.openSupportModal = async function() {
  const overlay = document.getElementById('supportModalOverlay');
  const modal = document.getElementById('supportModal');
  if (overlay) overlay.style.display = 'block';
  if (modal) modal.style.display = 'block';

  const profile = window.myProfile;
  if (profile && typeof _supabase !== 'undefined') {
    await _supabase
      .from('support_tickets')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('status', 'resolved');

    const badge = document.getElementById('supportAlertBadge');
    if (badge) badge.innerText = '';
  }
};

window.closeSupportModal = function() {
  const overlay = document.getElementById('supportModalOverlay');
  const modal = document.getElementById('supportModal');
  if (overlay) overlay.style.display = 'none';
  if (modal) modal.style.display = 'none';
};

window.submitSupportTicket = async function() {
  const profile = window.myProfile;
  if (!profile) {
    Swal.fire({
      title: 'ERROR',
      text: 'You must be logged in to contact support.',
      icon: 'error',
      background: '#111',
      color: '#fff',
      confirmButtonColor: '#f1c40f'
    });
    return;
  }

  const descriptionEl = document.getElementById('supportDescription');
  const description = descriptionEl ? descriptionEl.value.trim() : '';

  if (!description) {
    Swal.fire({
      title: 'WARNING',
      text: 'Please enter your message.',
      icon: 'warning',
      background: '#111',
      color: '#fff',
      confirmButtonColor: '#f1c40f'
    });
    return;
  }

  if (window.currentActiveTicketId) {
    const userDescTextEl = document.getElementById('supportUserDescriptionText');
    const currentDesc = userDescTextEl ? userDescTextEl.innerText : '';
    const updatedDescription = `${currentDesc}\n\n[YOU REPLY]:\n${description}`;

    const { error } = await _supabase
      .from('support_tickets')
      .update({
        description: updatedDescription,
        status: 'pending',
        is_read: false
      })
      .eq('id', window.currentActiveTicketId);

    if (error) {
      Swal.fire({
        title: 'ERROR',
        text: 'Failed to send reply.',
        icon: 'error',
        background: '#111',
        color: '#fff',
        confirmButtonColor: '#f1c40f'
      });
    } else {
      if (descriptionEl) descriptionEl.value = '';
      window.closeSupportModal();
      Swal.fire({
        title: 'SUCCESS',
        text: 'Your reply has been sent to support!',
        icon: 'success',
        background: '#111',
        color: '#fff',
        confirmButtonColor: '#f1c40f'
      });
      window.checkAdminReplies();
    }
  } else {
    const subjectEl = document.getElementById('supportSubject');
    const subject = subjectEl ? subjectEl.value.trim() : '';

    if (!subject) {
      Swal.fire({
        title: 'WARNING',
        text: 'Please enter a subject.',
        icon: 'warning',
        background: '#111',
        color: '#fff',
        confirmButtonColor: '#f1c40f'
      });
      return;
    }

    const { error } = await _supabase.from('support_tickets').insert([{
      user_id: profile.id,
      username: profile.username,
      subject: subject,
      description: `[YOU]:\n${description}`
    }]);

    if (error) {
      Swal.fire({
        title: 'ERROR',
        text: 'Failed to send ticket.',
        icon: 'error',
        background: '#111',
        color: '#fff',
        confirmButtonColor: '#f1c40f'
      });
    } else {
      if (subjectEl) subjectEl.value = '';
      if (descriptionEl) descriptionEl.value = '';
      window.closeSupportModal();
      Swal.fire({
        title: 'SUCCESS',
        text: 'Your ticket has been sent to the support!',
        icon: 'success',
        background: '#111',
        color: '#fff',
        confirmButtonColor: '#f1c40f'
      });
      window.checkAdminReplies();
    }
  }
};

window.closeAndArchieveTicket = async function() {
  if (!window.currentActiveTicketId || typeof _supabase === 'undefined') return;

  const { error } = await _supabase
    .from('support_tickets')
    .update({ status: 'closed' })
    .eq('id', window.currentActiveTicketId);

  if (error) {
    Swal.fire({
      title: 'ERROR',
      text: 'Failed to close ticket.',
      icon: 'error',
      background: '#111',
      color: '#fff',
      confirmButtonColor: '#f1c40f'
    });
  } else {
    Swal.fire({
      title: 'CLOSED',
      text: 'Ticket closed! Now you can create a new one.',
      icon: 'success',
      background: '#111',
      color: '#fff',
      confirmButtonColor: '#f1c40f'
    });
    const subEl = document.getElementById('supportSubject');
    const descEl = document.getElementById('supportDescription');
    if (subEl) subEl.value = '';
    if (descEl) descEl.value = '';
    await window.checkAdminReplies();
  }
};

window.checkAdminReplies = async function() {
  const profile = window.myProfile;
  if (!profile || typeof _supabase === 'undefined') return;

  const { data: tickets } = await _supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', profile.id)
    .neq('status', 'closed')
    .order('created_at', { ascending: false });

  const badge = document.getElementById('supportAlertBadge');

  if (tickets && tickets.length > 0) {
    const latestTicket = tickets[0];
    window.currentActiveTicketId = latestTicket.id;

    if (latestTicket.status === 'resolved' && !latestTicket.is_read) {
      if (badge) badge.innerHTML = ' <span style="color: #ff4444; font-weight: 900;">(1)</span>';
    } else {
      if (badge) badge.innerText = '';
    }

    const subEl = document.getElementById('supportUserSubject');
    const descEl = document.getElementById('supportUserDescriptionText');
    const inputSub = document.getElementById('supportSubject');
    const inputDesc = document.getElementById('supportDescription');
    const submitBtn = document.getElementById('supportSubmitBtn');

    if (subEl) subEl.innerText = latestTicket.subject || 'No Subject';
    if (descEl) descEl.innerText = latestTicket.description;
    if (inputSub) inputSub.style.display = 'none';
    if (inputDesc) inputDesc.placeholder = "Type your reply to support here...";
    if (submitBtn) submitBtn.innerText = "SEND REPLY";

    const replyText = document.getElementById('supportReplyText');
    const adminLabel = document.getElementById('adminResponseLabel');
    const closeSection = document.getElementById('closeTicketSection');

    if (latestTicket.admin_reply) {
      if (replyText) {
        replyText.innerText = latestTicket.admin_reply;
        replyText.style.display = 'block';
      }
      if (adminLabel) adminLabel.style.display = 'block';
      if (closeSection) closeSection.style.display = 'block';
    } else {
      if (adminLabel) adminLabel.style.display = 'none';
      if (replyText) replyText.style.display = 'none';
      if (closeSection) closeSection.style.display = 'none';
    }

    const replyContainer = document.getElementById('supportReplyContainer');
    if (replyContainer) replyContainer.style.display = 'block';
  } else {
    window.currentActiveTicketId = null;
    if (badge) badge.innerText = '';

    const inputSub = document.getElementById('supportSubject');
    const inputDesc = document.getElementById('supportDescription');
    const submitBtn = document.getElementById('supportSubmitBtn');
    const replyContainer = document.getElementById('supportReplyContainer');

    if (inputSub) inputSub.style.display = 'block';
    if (inputDesc) inputDesc.placeholder = "Describe your issue in detail here...";
    if (submitBtn) submitBtn.innerText = "SEND TICKET";
    if (replyContainer) replyContainer.style.display = 'none';
  }
};

/**
 * Окно авторизации
 */
window.openModal = async function() {
  if (typeof _supabase === 'undefined') return;

  const { value: formValues } = await Swal.fire({
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
    const { error } = await _supabase.auth.signInWithPassword({
      email: formValues.email,
      password: formValues.password,
    });

    if (error) {
      Swal.fire({ icon: 'error', title: 'ERROR', text: error.message, background: '#0a0a0a', color: '#fff' });
    } else {
      Swal.close();
      location.reload();
    }
  }
};
