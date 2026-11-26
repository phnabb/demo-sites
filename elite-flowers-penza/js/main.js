// Скрипты сайта «Elite Flowers»
(function () {
  'use strict';

  /* Утилиты: безопасный querySelector */
  function qs(selector, scope) {
    if (!selector) return null;
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    if (!selector) return [];
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  document.addEventListener('DOMContentLoaded', function () {
    initBurger();
    initCatalog();
    initCartUI();
    initBooking();
    initPanels();
    initBottomBar();
    initMatch();
  });

  /* 1. Бургер-меню */
  function initBurger() {
    var burger = qs('.header__burger');
    var nav = qs('.header__nav');
    if (!burger || !nav) return;

    function setOpen(isOpen) {
      var wasOpen = nav.classList.contains('is-open');
      nav.classList.toggle('is-open', isOpen);
      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      burger.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
      // Блокировка скролла через общий счётчик (не конфликтует с панелями)
      if (isOpen && !wasOpen) lockScroll();
      if (!isOpen && wasOpen) unlockScroll();
    }

    function closeMenu() {
      setOpen(false);
    }

    burger.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'));
    });

    // Закрытие по Escape (только если не открыты панели корзины/брони)
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open') && panelStack.length === 0) {
        closeMenu();
        burger.focus();
      }
    });

    // Закрытие по клику на ссылку меню
    qsa('.header__nav-link', nav).forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    // Сброс состояния при переходе на десктоп
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024 && nav.classList.contains('is-open')) {
        closeMenu();
      }
    });
  }

  /* 2. Корзина: хранилище, рендер и UI */
  var CART_KEY = 'elite-flowers-penza_cart';
  var cartMemory = []; // запасное хранилище, если localStorage недоступен

  // Чтение корзины с безопасным разбором и нормализацией позиций
  function readCart() {
    try {
      var raw = window.localStorage.getItem(CART_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (item) {
          return item && item.id && item.size;
        })
        .map(function (item) {
          var qty = parseInt(item.qty, 10);
          return {
            id: String(item.id),
            title: String(item.title || ''),
            size: String(item.size),
            price: parseInt(item.price, 10) || 0,
            qty: qty > 0 ? qty : 1
          };
        });
    } catch (error) {
      /* localStorage недоступен — работаем в памяти */
      return cartMemory.slice();
    }
  }

  // Сохранение корзины (в память и в localStorage)
  function writeCart(items) {
    cartMemory = items.slice();
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (error) {
      /* localStorage недоступен — изменения живут в памяти */
    }
  }

  // Добавление позиции: ключ — id + размер, при совпадении qty + 1
  function addToCart(product) {
    var items = readCart();
    var found = null;
    items.forEach(function (item) {
      if (item.id === String(product.id) && item.size === String(product.size)) found = item;
    });

    if (found) {
      found.qty += 1;
    } else {
      items.push({
        id: String(product.id),
        title: String(product.title || ''),
        size: String(product.size),
        price: parseInt(product.price, 10) || 0,
        qty: 1
      });
    }

    writeCart(items);
    return items;
  }

  // Изменение количества на delta, удаление при qty <= 0
  function updateQty(id, size, delta) {
    var items = readCart()
      .map(function (item) {
        if (item.id === id && item.size === size) item.qty += delta;
        return item;
      })
      .filter(function (item) {
        return item.qty > 0;
      });
    writeCart(items);
    return items;
  }

  // Удаление позиции по id и размеру
  function removeItem(id, size) {
    var items = readCart().filter(function (item) {
      return !(item.id === id && item.size === size);
    });
    writeCart(items);
    return items;
  }

  // Суммарное количество и стоимость
  function getTotalQty(items) {
    return items.reduce(function (sum, item) { return sum + item.qty; }, 0);
  }

  function getTotalPrice(items) {
    return items.reduce(function (sum, item) { return sum + item.price * item.qty; }, 0);
  }

  // Обновляет все бейджи корзины (header и bottom-bar)
  function syncBadges(n) {
    var count = n > 0 ? n : 0;
    qsa('[data-cart-count]').forEach(function (badge) {
      badge.textContent = String(count);
      badge.setAttribute('data-cart-count', String(count));
      var isEmpty = count === 0;
      badge.hidden = isEmpty;
      // Класс скрытия — только для бейджа нижней навигации
      if (badge.classList.contains('bottom-bar__badge')) {
        badge.classList.toggle('bottom-bar__badge--hidden', isEmpty);
      }
    });
    return count;
  }

  // Статичный SVG-крестик удаления (как у .cart__close)
  function createRemoveIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 6l12 12M18 6 6 18');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    return svg;
  }

  // Собирает li.cart__item для одной позиции (без innerHTML из данных)
  function buildCartItem(item) {
    var li = document.createElement('li');
    li.className = 'cart__item';
    li.setAttribute('data-id', item.id);
    li.setAttribute('data-size', item.size);

    var image = document.createElement('img');
    image.className = 'cart__item-image';
    image.src = 'photos/photo_2026-11-09_09-19-30.jpg';
    image.alt = '';
    image.width = 64;
    image.height = 64;

    var title = document.createElement('span');
    title.className = 'cart__item-title';
    title.textContent = item.title;

    var size = document.createElement('span');
    size.className = 'cart__item-size';
    size.textContent = 'Размер ' + item.size.toUpperCase();

    var qty = document.createElement('div');
    qty.className = 'cart__qty';

    var minus = document.createElement('button');
    minus.className = 'cart__qty-btn';
    minus.type = 'button';
    minus.setAttribute('data-cart-minus', '');
    minus.setAttribute('aria-label', 'Уменьшить количество');
    minus.textContent = '\u2212';

    var value = document.createElement('span');
    value.className = 'cart__qty-value';
    value.setAttribute('data-cart-qty', '');
    value.textContent = String(item.qty);

    var plus = document.createElement('button');
    plus.className = 'cart__qty-btn';
    plus.type = 'button';
    plus.setAttribute('data-cart-plus', '');
    plus.setAttribute('aria-label', 'Увеличить количество');
    plus.textContent = '+';

    qty.appendChild(minus);
    qty.appendChild(value);
    qty.appendChild(plus);

    var price = document.createElement('span');
    price.className = 'cart__item-price';
    price.setAttribute('data-cart-item-price', '');
    price.textContent = formatPrice(item.price * item.qty);

    var remove = document.createElement('button');
    remove.className = 'cart__item-remove';
    remove.type = 'button';
    remove.setAttribute('data-cart-remove', '');
    remove.setAttribute('aria-label', 'Удалить ' + item.title);
    remove.appendChild(createRemoveIcon());

    li.appendChild(image);
    li.appendChild(title);
    li.appendChild(size);
    li.appendChild(qty);
    li.appendChild(price);
    li.appendChild(remove);
    return li;
  }

  // Полная отрисовка корзины: список, пустое состояние, форма, итог, бейджи
  function renderCart() {
    var list = qs('[data-cart-list]');
    var items = readCart();

    if (list) {
      while (list.firstChild) list.removeChild(list.firstChild);
      items.forEach(function (item) {
        list.appendChild(buildCartItem(item));
      });
    }

    var isEmpty = items.length === 0;

    var emptyEl = qs('[data-cart-empty]');
    if (emptyEl) emptyEl.hidden = !isEmpty;

    var form = qs('[data-cart-form]');
    if (form) form.hidden = isEmpty;

    var totalEl = qs('[data-cart-total]');
    if (totalEl) totalEl.textContent = isEmpty ? '0\u00A0₽' : formatPrice(getTotalPrice(items));

    syncBadges(getTotalQty(items));
  }

  // Возврат корзины к рабочему состоянию после оформления
  function resetCartUI() {
    var success = qs('[data-cart-success]');
    if (success) success.hidden = true;

    var body = qs('.cart__body');
    if (body) body.hidden = false;

    var form = qs('[data-cart-form]');
    if (form) form.hidden = readCart().length === 0;
  }

  // Инициализация UI корзины: добавление, количество, доставка, оформление
  function initCartUI() {
    // Делегирование добавления из каталога (актуальный размер и цена карточки)
    document.addEventListener('click', function (event) {
      var target = event.target;
      var addBtn = target && target.closest ? target.closest('[data-cart-add]') : null;
      if (!addBtn) return;

      var card = addBtn.closest('.card');
      if (!card) return;

      var id = card.getAttribute('data-id');
      if (!id) return;

      var priceEl = qs('.card__price[data-price-value]', card);
      var titleEl = qs('.card__title', card);

      addToCart({
        id: id,
        title: card.getAttribute('data-title') || (titleEl ? titleEl.textContent : ''),
        size: card.getAttribute('data-selected-size') || 'm',
        price: priceEl ? parseInt(priceEl.getAttribute('data-price-value'), 10) : 0
      });
      renderCart();
    });

    // Количество и удаление внутри панели корзины
    var list = qs('[data-cart-list]');
    if (list) {
      list.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest) return;

        var row = target.closest('.cart__item');
        if (!row) return;

        var id = row.getAttribute('data-id');
        var size = row.getAttribute('data-size');
        var changed = true;

        if (target.closest('[data-cart-plus]')) {
          updateQty(id, size, 1);
        } else if (target.closest('[data-cart-minus]')) {
          updateQty(id, size, -1);
        } else if (target.closest('[data-cart-remove]')) {
          removeItem(id, size);
        } else {
          changed = false;
        }

        if (changed) renderCart();
      });
    }

    // Переключатель способа получения
    qsa('[data-delivery]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var mode = tab.getAttribute('data-delivery');

        qsa('[data-delivery]').forEach(function (item) {
          var isActive = item === tab;
          item.classList.toggle('cart__delivery-tab--active', isActive);
          item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        qsa('[data-delivery-panel]').forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-delivery-panel') !== mode;
        });
      });
    });

    // Оформление заказа
    var form = qs('[data-cart-form]');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();

        var items = readCart();
        if (!items.length) return; // пустую корзину не оформляем

        var activeTab = qs('.cart__delivery-tab--active');
        var mode = activeTab ? activeTab.getAttribute('data-delivery') : 'courier';
        var address = qs('[name="address"]', form);

        if (mode === 'courier' && address && !address.value.trim()) {
          address.setAttribute('aria-invalid', 'true');
          address.focus();
          return;
        }
        if (address) address.removeAttribute('aria-invalid');

        writeCart([]);
        renderCart();
        form.reset();

        var body = qs('.cart__body');
        if (body) body.hidden = true;
        if (form) form.hidden = true;
        var success = qs('[data-cart-success]');
        if (success) success.hidden = false;
      });
    }

    // Стартовая синхронизация бейджей и отрисовка
    syncBadges(getTotalQty(readCart()));
    renderCart();
  }

  /* 3. Панели корзины и брони + блокировка скролла */
  var scrollLockCount = 0;
  var panelStack = []; // стек открытых панелей (для Escape и возврата фокуса)

  function lockScroll() {
    scrollLockCount += 1;
    document.body.classList.add('is-locked');
  }

  function unlockScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) document.body.classList.remove('is-locked');
  }

  // Проверяет, что панель ещё открыта или находится в стеке
  function isPanelPending(root) {
    if (root.classList.contains('is-open')) return true;
    for (var i = 0; i < panelStack.length; i++) {
      if (panelStack[i].root === root) return true;
    }
    return false;
  }

  function openPanel(root, trigger) {
    if (!root) return;

    // Панель уже открыта — обновляем триггер без повторной блокировки скролла
    for (var i = 0; i < panelStack.length; i++) {
      if (panelStack[i].root === root) {
        panelStack[i].trigger = trigger || panelStack[i].trigger;
        return;
      }
    }

    root.hidden = false;
    void root.offsetWidth; // принудительный reflow для запуска анимации
    root.classList.add('is-open');

    panelStack.push({ root: root, trigger: trigger || null });
    lockScroll();

    // Фокус на кнопку закрытия для доступности
    var closeBtn = qs('button[data-cart-close], button[data-book-close]', root);
    if (closeBtn) closeBtn.focus();
  }

  function closePanel(root) {
    if (!root) return;

    var index = -1;
    for (var i = 0; i < panelStack.length; i++) {
      if (panelStack[i].root === root) { index = i; break; }
    }
    if (index === -1) return;

    var entry = panelStack.splice(index, 1)[0];
    root.classList.remove('is-open');
    unlockScroll();

    if (root.id === 'cart') resetCartUI();
    if (root.id === 'book') resetBookUI();

    // Скрываем панель только после завершения перехода
    var panelEl = qs('.cart__panel, .book__dialog', root) || root;
    var hideTimer = null;

    function finalize() {
      root.removeEventListener('transitionend', onTransitionEnd);
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      // Не скрываем, если панель успели открыть снова
      if (!isPanelPending(root)) root.hidden = true;
    }

    function onTransitionEnd(event) {
      if (event.target === panelEl && event.propertyName === 'transform') finalize();
    }

    root.addEventListener('transitionend', onTransitionEnd);
    hideTimer = window.setTimeout(finalize, 350); // фолбэк на случай отсутствия анимации

    if (entry.trigger && document.contains(entry.trigger)) entry.trigger.focus();
  }

  // Подстановка букета и размера в панель брони
  function fillBookSummary(trigger) {
    var bouquet = qs('[data-book-bouquet]');
    var size = qs('[data-book-size]');
    var card = trigger && trigger.closest ? trigger.closest('.card') : null;

    if (card) {
      var titleEl = qs('.card__title', card);
      var selected = card.getAttribute('data-selected-size') || '';
      if (bouquet) bouquet.textContent = titleEl ? titleEl.textContent : '—';
      if (size) size.textContent = selected ? selected.toUpperCase() : '—';
    } else {
      if (bouquet) bouquet.textContent = 'выбранный букет';
      if (size) size.textContent = '—';
    }
  }

  function initPanels() {
    qsa('[data-cart-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        renderCart();
        openPanel(qs('#cart') || qs('[data-cart-panel]'), button);
      });
    });

    qsa('[data-book-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        fillBookSummary(button);
        openPanel(qs('#book') || qs('[data-book-panel]'), button);
      });
    });

    qsa('[data-cart-close]').forEach(function (element) {
      element.addEventListener('click', function () {
        closePanel(qs('#cart') || qs('[data-cart-panel]'));
      });
    });

    qsa('[data-book-close]').forEach(function (element) {
      element.addEventListener('click', function () {
        closePanel(qs('#book') || qs('[data-book-panel]'));
      });
    });

    // Escape закрывает только верхнюю/последнюю открытую панель
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && panelStack.length) {
        closePanel(panelStack[panelStack.length - 1].root);
      }
    });

    // Ловушка фокуса внутри активной (верхней) панели
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || !panelStack.length) return;

      var root = panelStack[panelStack.length - 1].root;
      var focusable = qsa(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
        root
      ).filter(function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });

      if (!focusable.length) return;

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  /* 4. Бронь в 1 клик */
  function initBooking() {
    var form = qs('[data-book-form]');
    if (!form) return;

    var phone = qs('[name="phone"]', form);
    initPhoneMask(phone);

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var name = qs('[name="name"]', form);
      var digits = phone ? phone.value.replace(/\D/g, '') : '';
      var firstInvalid = null;

      // Имя
      if (!name || !name.value.trim()) {
        if (name) name.setAttribute('aria-invalid', 'true');
        firstInvalid = firstInvalid || name;
      } else if (name) {
        name.removeAttribute('aria-invalid');
      }

      // Телефон
      if (digits.length < 11) {
        if (phone) phone.setAttribute('aria-invalid', 'true');
        firstInvalid = firstInvalid || phone;
      } else if (phone) {
        phone.removeAttribute('aria-invalid');
      }

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      var success = qs('[data-book-success]');
      if (success) success.hidden = false;
      form.hidden = true;
      form.reset();
    });
  }

  // Возврат формы брони к исходному состоянию при закрытии панели
  function resetBookUI() {
    var form = qs('[data-book-form]');
    if (form) form.hidden = false;
    var success = qs('[data-book-success]');
    if (success) success.hidden = true;
  }

  /* 5. Активный пункт нижней навигации */
  function initBottomBar() {
    var bar = qs('.bottom-bar');
    if (!bar) return;

    var links = qsa('.bottom-bar__link', bar);
    var sections = qsa('#catalog, #match, #contacts');
    if (!links.length || !sections.length) return;

    function activate(id) {
      var matched = false;
      links.forEach(function (link) {
        var isTarget = link.getAttribute('href') === '#' + id;
        link.classList.toggle('is-active', isTarget);
        if (isTarget) matched = true;
      });
      return matched;
    }

    // Fallback для браузеров без IntersectionObserver
    if (!('IntersectionObserver' in window)) {
      var fallback = function () {
        var offset = window.innerHeight / 2;
        var current = sections[0];
        sections.forEach(function (section) {
          if (section.getBoundingClientRect().top <= offset) current = section;
        });
        activate(current.id);
      };
      window.addEventListener('scroll', fallback, { passive: true });
      window.addEventListener('resize', fallback);
      fallback();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activate(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* 6. Каталог: переключатель размера и фильтры-табы */
  // Форматирует число в цену вида «4 900 ₽» с неразрывными пробелами
  function formatPrice(value) {
    var number = parseInt(value, 10);
    if (isNaN(number)) return '';
    return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') + '\u00A0₽';
  }

  function initCatalog() {
    var grid = qs('.catalog__grid');
    if (!grid) return;

    var cards = qsa('.card', grid);
    var tabs = qsa('.catalog__tab');

    // 1. Пересчёт цены при смене размера (делегирование по карточке)
    cards.forEach(function (card) {
      var sizes = qsa('.card__size', card);
      var priceEl = qs('.card__price', card);
      if (!sizes.length || !priceEl) return;

      // Синхронизируем aria-pressed с активной кнопкой при загрузке
      sizes.forEach(function (item) {
        item.setAttribute('aria-pressed', item.classList.contains('card__size--active') ? 'true' : 'false');
      });

      card.addEventListener('click', function (event) {
        var target = event.target;
        var button = target && target.closest ? target.closest('.card__size') : null;
        if (!button) return;

        sizes.forEach(function (item) {
          var isActive = item === button;
          item.classList.toggle('card__size--active', isActive);
          item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        var price = button.getAttribute('data-price') || '';
        var size = button.getAttribute('data-size') || '';
        priceEl.textContent = formatPrice(price);
        priceEl.setAttribute('data-price-value', price);
        card.setAttribute('data-selected-size', size);
      });
    });

    // 2. Фильтрация карточек по табам
    if (!tabs.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var filter = tab.getAttribute('data-filter');

        tabs.forEach(function (item) {
          var isActive = item === tab;
          item.classList.toggle('catalog__tab--active', isActive);
          item.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        cards.forEach(function (card) {
          var category = card.getAttribute('data-category');
          var show = filter === 'all' || category === filter;
          card.classList.toggle('card--hidden', !show);
        });
      });
    });
  }

  /* 7. Квиз подбора букета: чипсы, маска телефона и заглушка отправки */
  function initMatch() {
    var form = qs('.match__form');
    if (!form) return;

    // 1. Группы тач-чипсов: выбор одного значения и запись в скрытый input
    qsa('.match__field', form).forEach(function (group) {
      var chips = qsa('.match__chip', group);
      var hidden = qs('.match__value', group);
      if (!chips.length || !hidden) return;

      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          chips.forEach(function (item) {
            var isActive = item === chip;
            item.classList.toggle('match__chip--active', isActive);
            item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          hidden.value = chip.getAttribute('data-value') || '';
        });
      });
    });

    // 2. Маска телефона формата +7 (999) 999-99-99
    initPhoneMask(qs('.match__phone', form));

    // 3. Отправка — заглушка без реальной отправки
    form.addEventListener('submit', function (event) {
      event.preventDefault();
    });
  }

  // Оставляет только цифры и форматирует их в российский номер
  function initPhoneMask(input) {
    if (!input) return;

    function formatPhone(value) {
      var digits = value.replace(/\D/g, '');
      if (!digits) return '';
      if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
      if (digits.charAt(0) !== '7') digits = '7' + digits;
      digits = digits.slice(0, 11);

      var result = '+7';
      if (digits.length > 1) result += ' (' + digits.slice(1, 4);
      if (digits.length >= 5) result += ') ' + digits.slice(4, 7);
      if (digits.length >= 8) result += '-' + digits.slice(7, 9);
      if (digits.length >= 10) result += '-' + digits.slice(9, 11);
      return result;
    }

    input.addEventListener('input', function () {
      input.value = formatPhone(input.value);
    });
  }
})();
