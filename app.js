(function () {
  "use strict";

  var STORAGE_KEY = "calorieApp_v1";
  var RING_CIRCUMFERENCE = 2 * Math.PI * 95; // r=95, matches SVG

  // macros = { p, c, f } 每克的蛋白质/碳水/脂肪克数
  var DEFAULT_FOODS = [
    { id: "chicken_breast",    name: "鸡胸肉",     emoji: "🍗", calPerGram: 1.65, macros: { p: 0.310, c: 0.000, f: 0.036 }, builtin: true },
    { id: "braised_beef",      name: "卤牛肉",     emoji: "🥩", calPerGram: 2.46, macros: { p: 0.280, c: 0.030, f: 0.140 }, builtin: true },
    { id: "white_rice",        name: "白米饭",     emoji: "🍚", calPerGram: 1.16, macros: { p: 0.024, c: 0.256, f: 0.002 }, builtin: true },
    { id: "black_rice",       name: "黑米饭",     emoji: "🌾", calPerGram: 1.33, macros: { p: 0.040, c: 0.280, f: 0.010 }, builtin: true },
    { id: "mixed_black_rice", name: "混合黑米饭", emoji: "🍱", calPerGram: 1.23, macros: { p: 0.032, c: 0.268, f: 0.006 }, builtin: true },
    { id: "egg",               name: "鸡蛋",       emoji: "🥚", calPerGram: 1.47, macros: { p: 0.126, c: 0.011, f: 0.099 }, builtin: true },
    { id: "oats",              name: "燕麦(干)",   emoji: "🥣", calPerGram: 3.89, macros: { p: 0.169, c: 0.663, f: 0.069 }, builtin: true },
    { id: "broccoli",         name: "西兰花(熟)", emoji: "🥦", calPerGram: 0.35, macros: { p: 0.024, c: 0.072, f: 0.004 }, builtin: true },
    { id: "banana",            name: "香蕉",       emoji: "🍌", calPerGram: 0.89, macros: { p: 0.011, c: 0.229, f: 0.003 }, builtin: true },
    { id: "milk",              name: "牛奶(全脂)", emoji: "🥛", calPerGram: 0.65, macros: { p: 0.033, c: 0.048, f: 0.036 }, builtin: true },
    { id: "tofu",              name: "豆腐",       emoji: "🍲", calPerGram: 0.82, macros: { p: 0.080, c: 0.019, f: 0.048 }, builtin: true },
    { id: "salmon",            name: "三文鱼",     emoji: "🐟", calPerGram: 1.39, macros: { p: 0.200, c: 0.000, f: 0.063 }, builtin: true },
    { id: "sweet_potato",     name: "红薯(熟)",   emoji: "🍠", calPerGram: 0.86, macros: { p: 0.016, c: 0.200, f: 0.001 }, builtin: true },
    { id: "whole_bread",      name: "全麦面包",   emoji: "🍞", calPerGram: 2.46, macros: { p: 0.130, c: 0.410, f: 0.042 }, builtin: true },
    { id: "potato",            name: "土豆(熟)",   emoji: "🥔", calPerGram: 0.77, macros: { p: 0.019, c: 0.170, f: 0.001 }, builtin: true }
  ];

  var state = null;
  var currentMealId = null;

  // ---------- utils ----------
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function todayDisplay() {
    var d = new Date();
    var weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + weekday;
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  // ---------- persistence ----------
  function initState() {
    return { foods: DEFAULT_FOODS.map(function (f) { return Object.assign({}, f); }), days: {} };
  }

  // older saves have foods without macros — backfill builtins from the
  // default table, custom foods get zeros
  function migrateFoods(foods) {
    foods.forEach(function (f) {
      if (!f.macros) {
        var def = null;
        for (var i = 0; i < DEFAULT_FOODS.length; i++) {
          if (DEFAULT_FOODS[i].id === f.id) { def = DEFAULT_FOODS[i]; break; }
        }
        f.macros = def ? Object.assign({}, def.macros) : { p: 0, c: 0, f: 0 };
      }
    });
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initState();
      var parsed = JSON.parse(raw);
      if (!parsed.foods || !parsed.days) return initState();
      migrateFoods(parsed.foods);
      return parsed;
    } catch (e) {
      return initState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function defaultMealsTemplate() {
    return [
      { id: uid(), name: "早餐", limit: 500, items: [] },
      { id: uid(), name: "午餐", limit: 700, items: [] },
      { id: uid(), name: "晚餐", limit: 600, items: [] }
    ];
  }

  function getDay(dateStr) {
    if (!state.days[dateStr]) {
      var dates = Object.keys(state.days).sort();
      var prevDay = dates.length ? state.days[dates[dates.length - 1]] : null;
      state.days[dateStr] = {
        dailyLimit: prevDay ? prevDay.dailyLimit : 2000,
        meals: prevDay
          ? prevDay.meals.map(function (m) { return { id: uid(), name: m.name, limit: m.limit, items: [] }; })
          : defaultMealsTemplate()
      };
      saveState();
    }
    return state.days[dateStr];
  }

  function getFood(id) {
    for (var i = 0; i < state.foods.length; i++) if (state.foods[i].id === id) return state.foods[i];
    return state.foods[0];
  }

  function currentDay() { return getDay(todayStr()); }

  function findMeal(mealId) {
    var day = currentDay();
    for (var i = 0; i < day.meals.length; i++) if (day.meals[i].id === mealId) return day.meals[i];
    return null;
  }

  function mealConsumed(meal) {
    return meal.items.reduce(function (sum, it) {
      return sum + it.grams * getFood(it.foodId).calPerGram;
    }, 0);
  }

  function dayConsumed(day) {
    return day.meals.reduce(function (sum, m) { return sum + mealConsumed(m); }, 0);
  }

  function itemMacros(item) {
    var m = getFood(item.foodId).macros || { p: 0, c: 0, f: 0 };
    return { p: item.grams * m.p, c: item.grams * m.c, f: item.grams * m.f };
  }

  function mealMacros(meal) {
    return meal.items.reduce(function (acc, it) {
      var m = itemMacros(it);
      return { p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f };
    }, { p: 0, c: 0, f: 0 });
  }

  function dayMacros(day) {
    return day.meals.reduce(function (acc, meal) {
      var m = mealMacros(meal);
      return { p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f };
    }, { p: 0, c: 0, f: 0 });
  }

  function totalMealLimits(day) {
    return day.meals.reduce(function (s, m) { return s + m.limit; }, 0);
  }

  // Raising one meal's limit takes budget from the rest of the day: when the
  // sum of all meal limits would exceed the daily limit, the OTHER meals
  // shrink proportionally, and any food already recorded in a shrunk meal is
  // scaled down to stay within its new limit.
  function setMealLimit(day, mealId, rawLimit) {
    var meal = null;
    for (var i = 0; i < day.meals.length; i++) {
      if (day.meals[i].id === mealId) { meal = day.meals[i]; break; }
    }
    if (!meal) return;
    var newLimit = clamp(isNaN(rawLimit) ? 0 : rawLimit, 0, day.dailyLimit);
    var others = day.meals.filter(function (m) { return m.id !== mealId; });
    var othersTotal = others.reduce(function (s, m) { return s + m.limit; }, 0);
    var allowed = Math.max(0, day.dailyLimit - newLimit);
    if (othersTotal > allowed + 1e-9) {
      var scale = othersTotal > 0 ? allowed / othersTotal : 0;
      others.forEach(function (m) {
        m.limit = m.limit * scale;
        clampMealToLimit(m);
      });
    }
    meal.limit = newLimit;
    clampMealToLimit(meal);
  }

  // when the daily limit itself drops below the sum of meal limits, scale
  // every meal down proportionally
  function rebalanceMealLimits(day) {
    var total = totalMealLimits(day);
    if (total > day.dailyLimit + 1e-9) {
      var scale = total > 0 ? day.dailyLimit / total : 0;
      day.meals.forEach(function (m) {
        m.limit = m.limit * scale;
        clampMealToLimit(m);
      });
    }
  }

  function foodInUse(foodId) {
    var day = currentDay();
    return day.meals.some(function (m) {
      return m.items.some(function (it) { return it.foodId === foodId; });
    });
  }

  // ---------- balancing logic ----------
  // Increasing one item's grams eats into the meal's calorie budget; if the
  // remaining items no longer fit under the meal limit, shrink them
  // proportionally to their current share so the total stays within budget.
  function setItemGrams(meal, itemId, rawGrams) {
    var item = meal.items.find(function (it) { return it.id === itemId; });
    if (!item) return;
    var food = getFood(item.foodId);
    var grams = Math.max(0, rawGrams);
    var newCal = grams * food.calPerGram;
    var cap = Math.max(0, meal.limit);

    if (newCal > cap) {
      newCal = cap;
      grams = food.calPerGram > 0 ? newCal / food.calPerGram : grams;
    }

    var others = meal.items.filter(function (it) { return it.id !== itemId; });
    var othersTotal = others.reduce(function (s, it) { return s + it.grams * getFood(it.foodId).calPerGram; }, 0);
    var allowedOthers = Math.max(0, cap - newCal);

    if (othersTotal > allowedOthers + 1e-9) {
      var scale = othersTotal > 0 ? allowedOthers / othersTotal : 0;
      others.forEach(function (it) {
        var f = getFood(it.foodId);
        var curCal = it.grams * f.calPerGram;
        var newC = curCal * scale;
        it.grams = f.calPerGram > 0 ? newC / f.calPerGram : 0;
      });
    }

    item.grams = grams;
  }

  function clampMealToLimit(meal) {
    var total = mealConsumed(meal);
    if (total > meal.limit && total > 0) {
      var scale = meal.limit > 0 ? meal.limit / total : 0;
      meal.items.forEach(function (it) { it.grams = it.grams * scale; });
    }
  }

  // ---------- rendering: ring ----------
  function renderRing() {
    var day = currentDay();
    var consumed = dayConsumed(day);
    var limit = day.dailyLimit;
    var percent = limit > 0 ? clamp(consumed / limit, 0, 1) : 0;
    var offset = RING_CIRCUMFERENCE * (1 - percent);
    var over = consumed > limit;

    var ringFg = document.getElementById("ringFg");
    ringFg.style.strokeDashoffset = offset;
    ringFg.classList.toggle("over", over);

    var remaining = Math.round(limit - consumed);
    var remainingEl = document.getElementById("ringRemaining");
    remainingEl.textContent = (over ? "+" : "") + Math.abs(remaining);
    remainingEl.classList.toggle("over", over);

    document.getElementById("ringLabel").textContent = over ? "超出 kcal" : "剩余 kcal";
    document.getElementById("ringSub").textContent =
      "已摄入 " + Math.round(consumed) + " / " + Math.round(limit) + " kcal";

    renderDayMacros(day);
  }

  function renderDayMacros(day) {
    var m = dayMacros(day);
    document.getElementById("macroP").textContent = round1(m.p) + " g";
    document.getElementById("macroC").textContent = round1(m.c) + " g";
    document.getElementById("macroF").textContent = round1(m.f) + " g";
  }

  // ---------- rendering: meal cards ----------
  function renderMeals() {
    var day = currentDay();
    var grid = document.getElementById("mealsGrid");
    grid.innerHTML = day.meals.map(function (m) {
      var consumed = mealConsumed(m);
      var pct = m.limit > 0 ? clamp(consumed / m.limit, 0, 1) * 100 : 0;
      var over = consumed > m.limit;
      var preview = m.items.length
        ? m.items.map(function (it) { return getFood(it.foodId).emoji; }).join(" ")
        : "暂无食物，点击添加";
      return (
        '<div class="meal-card' + (over ? " over" : "") + '" data-meal-id="' + m.id + '">' +
          '<div class="meal-card-top">' +
            '<span class="meal-name">' + escapeHtml(m.name) + "</span>" +
            '<span class="meal-kcal">' + Math.round(consumed) + " / " + Math.round(m.limit) + "</span>" +
          "</div>" +
          '<div class="meal-bar"><div class="meal-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="meal-foods-preview">' + preview + "</div>" +
        "</div>"
      );
    }).join("");
  }

  function refreshAll() {
    renderRing();
    renderMeals();
    saveState();
  }

  // ---------- modal helpers ----------
  function openModal(id) { document.getElementById(id).classList.add("open"); }
  function closeModal(id) { document.getElementById(id).classList.remove("open"); }

  // ---------- meal detail modal ----------
  function openMealModal(mealId) {
    currentMealId = mealId;
    var meal = findMeal(mealId);
    if (!meal) return;
    document.getElementById("mealNameInput").value = meal.name;
    document.getElementById("mealLimitInput").value = Math.round(meal.limit);
    renderFoodItemsList(meal);
    renderMealSummary(meal);
    openModal("mealModalOverlay");
  }

  function maxRangeFor(meal, food) {
    var byLimit = food.calPerGram > 0 ? meal.limit / food.calPerGram : 500;
    return Math.max(100, Math.ceil(byLimit));
  }

  function foodOptionsHtml(selectedId) {
    return state.foods.map(function (f) {
      return '<option value="' + f.id + '"' + (f.id === selectedId ? " selected" : "") + ">" +
        f.emoji + " " + escapeHtml(f.name) + "</option>";
    }).join("");
  }

  function renderFoodItemsList(meal) {
    var list = document.getElementById("foodItemsList");
    list.innerHTML = meal.items.map(function (item) {
      var food = getFood(item.foodId);
      var cal = item.grams * food.calPerGram;
      var maxRange = maxRangeFor(meal, food);
      return (
        '<div class="food-item-row" data-item-id="' + item.id + '">' +
          '<div class="food-item-top">' +
            '<select class="food-select">' + foodOptionsHtml(item.foodId) + "</select>" +
            '<span class="item-kcal">' + Math.round(cal) + " kcal</span>" +
            '<button class="remove-item-btn" title="删除">✕</button>' +
          "</div>" +
          '<div class="grams-control">' +
            '<input type="range" class="grams-range" min="0" max="' + maxRange + '" step="1" value="' + item.grams + '">' +
            '<input type="number" class="grams-number" min="0" step="1" value="' + Math.round(item.grams) + '">' +
            '<span class="unit-g">g</span>' +
          "</div>" +
          '<div class="item-macros">' + itemMacrosText(item) + "</div>" +
        "</div>"
      );
    }).join("") || '<p class="hint-text">这一餐还没有食物，点击下方按钮添加。</p>';
  }

  function itemMacrosText(item) {
    var m = itemMacros(item);
    return "蛋白 " + round1(m.p) + " · 碳水 " + round1(m.c) + " · 脂肪 " + round1(m.f) + " g";
  }

  function renderMealSummary(meal) {
    var total = mealConsumed(meal);
    var over = total > meal.limit;
    var pct = meal.limit > 0 ? clamp(total / meal.limit, 0, 1) * 100 : 0;
    var macros = mealMacros(meal);
    var summary = document.getElementById("mealSummary");
    summary.innerHTML =
      '<div class="meal-summary-bar"><div class="meal-summary-bar-fill' + (over ? " over" : "") +
        '" style="width:' + pct + '%"></div></div>' +
      '<div class="meal-summary-row">' +
        "<span>本餐合计</span>" +
        '<span class="meal-summary-total' + (over ? " over" : "") + '">' + Math.round(total) + " / " + Math.round(meal.limit) + " kcal</span>" +
      "</div>" +
      '<div class="meal-summary-row meal-summary-macros">' +
        "<span>宏量</span>" +
        "<span>蛋白质 " + round1(macros.p) + " g · 碳水 " + round1(macros.c) + " g · 脂肪 " + round1(macros.f) + " g</span>" +
      "</div>";
  }

  // Update numbers in place without rebuilding rows, so an active slider drag
  // or an in-progress number-field edit doesn't get its DOM node replaced.
  function refreshFoodItemsUI(meal, skipNumberFieldForItemId) {
    var list = document.getElementById("foodItemsList");
    meal.items.forEach(function (item) {
      var row = list.querySelector('[data-item-id="' + item.id + '"]');
      if (!row) return;
      var food = getFood(item.foodId);
      var cal = item.grams * food.calPerGram;
      var rangeEl = row.querySelector(".grams-range");
      var numEl = row.querySelector(".grams-number");
      if (rangeEl) rangeEl.value = item.grams;
      if (numEl && item.id !== skipNumberFieldForItemId) numEl.value = round1(item.grams);
      row.querySelector(".item-kcal").textContent = Math.round(cal) + " kcal";
      row.querySelector(".item-macros").textContent = itemMacrosText(item);
    });
  }

  function onMealDetailChange(meal) {
    refreshFoodItemsUI(meal, null);
    renderMealSummary(meal);
    renderMeals();
    renderRing();
    saveState();
  }

  document.getElementById("foodItemsList").addEventListener("input", function (e) {
    var meal = findMeal(currentMealId);
    if (!meal) return;
    var row = e.target.closest(".food-item-row");
    if (!row) return;
    var itemId = row.dataset.itemId;

    if (e.target.classList.contains("grams-range")) {
      setItemGrams(meal, itemId, parseFloat(e.target.value) || 0);
      refreshFoodItemsUI(meal, null);
      renderMealSummary(meal);
      renderMeals();
      renderRing();
      saveState();
    } else if (e.target.classList.contains("grams-number")) {
      var raw = e.target.value;
      var typedGrams = raw === "" ? 0 : parseFloat(raw);
      setItemGrams(meal, itemId, isNaN(typedGrams) ? 0 : typedGrams);
      var item = meal.items.find(function (it) { return it.id === itemId; });
      // if the app had to clamp the value, show the corrected number right
      // away instead of leaving the field showing a number that no longer
      // matches the displayed kcal
      var wasClamped = Math.abs(item.grams - typedGrams) > 0.05;
      refreshFoodItemsUI(meal, wasClamped ? null : itemId);
      renderMealSummary(meal);
      renderMeals();
      renderRing();
      saveState();
    }
  });

  document.getElementById("foodItemsList").addEventListener("change", function (e) {
    var meal = findMeal(currentMealId);
    if (!meal) return;
    var row = e.target.closest(".food-item-row");
    if (!row) return;
    var itemId = row.dataset.itemId;

    if (e.target.classList.contains("food-select")) {
      var item = meal.items.find(function (it) { return it.id === itemId; });
      item.foodId = e.target.value;
      setItemGrams(meal, itemId, item.grams);
      renderFoodItemsList(meal);
      renderMealSummary(meal);
      renderMeals();
      renderRing();
      saveState();
    } else if (e.target.classList.contains("grams-number")) {
      // normalize display after the user finishes typing
      refreshFoodItemsUI(meal, null);
      saveState();
    }
  });

  document.getElementById("foodItemsList").addEventListener("click", function (e) {
    if (!e.target.classList.contains("remove-item-btn")) return;
    var meal = findMeal(currentMealId);
    if (!meal) return;
    var row = e.target.closest(".food-item-row");
    var itemId = row.dataset.itemId;
    meal.items = meal.items.filter(function (it) { return it.id !== itemId; });
    renderFoodItemsList(meal);
    renderMealSummary(meal);
    renderMeals();
    renderRing();
    saveState();
  });

  document.getElementById("addFoodItemBtn").addEventListener("click", function () {
    var meal = findMeal(currentMealId);
    if (!meal) return;
    meal.items.push({ id: uid(), foodId: state.foods[0].id, grams: 0 });
    renderFoodItemsList(meal);
    renderMealSummary(meal);
    renderMeals();
    renderRing();
    saveState();
  });

  document.getElementById("mealNameInput").addEventListener("input", function (e) {
    var meal = findMeal(currentMealId);
    if (!meal) return;
    meal.name = e.target.value;
    renderMeals();
    saveState();
  });

  // commit on change (blur / Enter) rather than per keystroke, so partially
  // typed numbers like the "7" in "700" don't trigger the day-level rebalance
  document.getElementById("mealLimitInput").addEventListener("change", function (e) {
    var meal = findMeal(currentMealId);
    if (!meal) return;
    var val = parseFloat(e.target.value);
    setMealLimit(currentDay(), currentMealId, isNaN(val) ? 0 : Math.max(0, val));
    e.target.value = Math.round(meal.limit);
    renderFoodItemsList(meal);
    renderMealSummary(meal);
    renderMeals();
    renderRing();
    saveState();
  });

  document.getElementById("deleteMealBtn").addEventListener("click", function () {
    if (!currentMealId) return;
    if (!window.confirm("确定要删除这个餐次吗？其中记录的食物也会一并删除。")) return;
    var day = currentDay();
    day.meals = day.meals.filter(function (m) { return m.id !== currentMealId; });
    closeModal("mealModalOverlay");
    refreshAll();
  });

  // ---------- add meal modal ----------
  document.getElementById("addMealBtn").addEventListener("click", function () {
    document.getElementById("newMealName").value = "";
    document.getElementById("newMealLimit").value = "";
    openModal("addMealModalOverlay");
  });

  document.getElementById("createMealBtn").addEventListener("click", function () {
    var name = document.getElementById("newMealName").value.trim() || "新餐次";
    var limit = parseFloat(document.getElementById("newMealLimit").value);
    if (isNaN(limit) || limit < 0) limit = 300;
    var day = currentDay();
    var newId = uid();
    // insert at 0 kcal, then grow to the requested limit so the other meals
    // give up budget proportionally if the day is already full
    day.meals.push({ id: newId, name: name, limit: 0, items: [] });
    setMealLimit(day, newId, limit);
    closeModal("addMealModalOverlay");
    refreshAll();
  });

  // ---------- daily limit modal ----------
  document.getElementById("editLimitBtn").addEventListener("click", function () {
    document.getElementById("dailyLimitInput").value = currentDay().dailyLimit;
    openModal("limitModalOverlay");
  });

  document.getElementById("saveLimitBtn").addEventListener("click", function () {
    var val = parseFloat(document.getElementById("dailyLimitInput").value);
    if (isNaN(val) || val < 0) val = 0;
    var day = currentDay();
    day.dailyLimit = val;
    rebalanceMealLimits(day);
    closeModal("limitModalOverlay");
    refreshAll();
  });

  // ---------- food library modal ----------
  function foodTag(f) {
    if (f.recipe) return "菜谱";
    if (f.source === "cnf") return "🍁 CNF";
    return f.builtin ? "预设" : "自定义";
  }

  function renderLibrary() {
    var q = (document.getElementById("librarySearch").value || "").trim().toLowerCase();
    var terms = q ? q.split(/\s+/) : [];
    var list = document.getElementById("libraryList");
    var foods = state.foods.filter(function (f) {
      var name = f.name.toLowerCase();
      return terms.every(function (t) { return name.indexOf(t) >= 0; });
    });
    if (!foods.length) {
      list.innerHTML = '<p class="hint-text">本地库没有匹配的食物。</p>';
      return;
    }
    list.innerHTML = foods.map(function (f) {
      var per100 = round1(f.calPerGram * 100);
      return (
        '<div class="library-row" data-food-id="' + f.id + '">' +
          '<div class="library-emoji">' + f.emoji + "</div>" +
          '<div class="library-info">' +
            '<div class="library-name">' + escapeHtml(f.name) +
              '<span class="library-tag">' + foodTag(f) + "</span>" +
            "</div>" +
            '<div class="library-cal">' + f.calPerGram + " kcal/g（约 " + per100 + " kcal/100g）</div>" +
            '<div class="library-cal">每100g：蛋白 ' + round1((f.macros ? f.macros.p : 0) * 100) +
              " · 碳水 " + round1((f.macros ? f.macros.c : 0) * 100) +
              " · 脂肪 " + round1((f.macros ? f.macros.f : 0) * 100) + " g</div>" +
          "</div>" +
          '<div class="library-actions">' +
            '<button class="icon-mini-btn edit-food-btn" title="编辑">✎</button>' +
            '<button class="icon-mini-btn danger delete-food-btn" title="删除">🗑</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  document.getElementById("openLibraryBtn").addEventListener("click", function () {
    renderLibrary();
    renderCnfSearch();
    openModal("libraryModalOverlay");
  });

  document.getElementById("librarySearch").addEventListener("input", function () {
    renderLibrary();
    renderCnfSearch();
  });

  // ---------- CNF (Canadian Nutrient File, Health Canada) ----------
  var CNF_BASE = "https://food-nutrition.canada.ca/api/canadian-nutrient-file/";
  var CNF_CACHE_KEY = "calorieApp_cnfList_v1";
  var cnfList = null;      // [[food_code, description], ...]
  var cnfLoading = false;
  var cnfLoadError = null;

  function setCnfStatus(msg) {
    document.getElementById("cnfStatus").textContent = msg;
  }

  function cnfEnsureList(onReady) {
    if (cnfList) { onReady(); return; }
    try {
      var raw = localStorage.getItem(CNF_CACHE_KEY);
      if (raw) { cnfList = JSON.parse(raw); onReady(); return; }
    } catch (e) { /* fall through to network */ }
    if (cnfLoading) return;
    cnfLoading = true;
    cnfLoadError = null;
    setCnfStatus("首次使用：正在下载食物列表（约 5,700 种，只需一次）…");
    fetch(CNF_BASE + "food/?lang=en&type=json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (arr) {
        cnfList = arr.map(function (x) { return [x.food_code, x.food_description]; });
        try { localStorage.setItem(CNF_CACHE_KEY, JSON.stringify(cnfList)); } catch (e) { /* cache miss is fine */ }
        cnfLoading = false;
        onReady();
      })
      .catch(function (err) {
        cnfLoading = false;
        cnfLoadError = err;
        setCnfStatus("下载失败（" + err.message + "），请检查网络后重新输入搜索词。");
      });
  }

  function renderCnfSearch() {
    var q = (document.getElementById("librarySearch").value || "").trim();
    var section = document.getElementById("cnfSection");
    var results = document.getElementById("cnfResults");
    if (q.length < 2) {
      section.style.display = "none";
      results.innerHTML = "";
      return;
    }
    section.style.display = "";
    cnfEnsureList(function () {
      // this callback may fire after the user changed the query — re-read it
      var query = (document.getElementById("librarySearch").value || "").trim().toLowerCase();
      if (query.length < 2) return;
      var terms = query.split(/\s+/);
      var hits = [];
      for (var i = 0; i < cnfList.length && hits.length < 20; i++) {
        var desc = cnfList[i][1].toLowerCase();
        var all = true;
        for (var t = 0; t < terms.length; t++) {
          if (desc.indexOf(terms[t]) < 0) { all = false; break; }
        }
        if (all) hits.push(cnfList[i]);
      }
      if (!hits.length) {
        setCnfStatus("没有匹配结果。CNF 是英文数据库，请用英文搜索（例如 chicken breast、tomato raw）。");
        results.innerHTML = "";
        return;
      }
      setCnfStatus(hits.length >= 20 ? "显示前 20 条，可输入更具体的关键词" : hits.length + " 条结果，点击导入到本地库");
      results.innerHTML = hits.map(function (h) {
        var imported = state.foods.some(function (f) { return f.cnfCode === h[0]; });
        return '<div class="cnf-row" data-cnf-code="' + h[0] + '">' +
          "<span>" + escapeHtml(h[1]) + "</span>" +
          '<span class="cnf-import-hint">' + (imported ? "已导入 ✓" : "+ 导入") + "</span>" +
        "</div>";
      }).join("");
    });
  }

  document.getElementById("cnfResults").addEventListener("click", function (e) {
    var row = e.target.closest(".cnf-row");
    if (!row) return;
    var code = parseInt(row.dataset.cnfCode, 10);
    if (state.foods.some(function (f) { return f.cnfCode === code; })) return;
    var pair = null;
    for (var i = 0; i < cnfList.length; i++) if (cnfList[i][0] === code) { pair = cnfList[i]; break; }
    if (!pair) return;
    row.querySelector(".cnf-import-hint").textContent = "导入中…";
    fetch(CNF_BASE + "nutrientamount/?id=" + code + "&lang=en&type=json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (arr) {
        // CNF values are per 100 g edible portion; ids: 208 kcal, 203 protein, 204 fat, 205 carb
        function get(id) {
          for (var i = 0; i < arr.length; i++) if (arr[i].nutrient_name_id === id) return arr[i].nutrient_value;
          return 0;
        }
        var kcal = get(208), p = get(203), fat = get(204), c = get(205);
        if (!kcal) kcal = p * 4 + c * 4 + fat * 9;
        state.foods.push({
          id: uid(),
          name: pair[1],
          emoji: "🍁",
          calPerGram: Math.round(kcal) / 100,
          macros: {
            p: Math.round(p * 100) / 10000,
            c: Math.round(c * 100) / 10000,
            f: Math.round(fat * 100) / 10000
          },
          source: "cnf",
          cnfCode: code,
          builtin: false
        });
        saveState();
        renderLibrary();
        renderCnfSearch();
      })
      .catch(function (err) {
        row.querySelector(".cnf-import-hint").textContent = "+ 导入";
        window.alert("导入失败：" + err.message + "，请重试。");
      });
  });

  document.getElementById("libraryList").addEventListener("click", function (e) {
    var row = e.target.closest(".library-row");
    if (!row) return;
    var foodId = row.dataset.foodId;
    var food = getFood(foodId);

    if (e.target.classList.contains("delete-food-btn")) {
      if (foodInUse(foodId)) {
        window.alert("这个食物正在被今天的某个餐次使用，无法删除。请先从餐次中移除它。");
        return;
      }
      var usingRecipe = null;
      for (var ri = 0; ri < state.foods.length; ri++) {
        var rf = state.foods[ri];
        if (rf.recipe && rf.recipe.ingredients.some(function (ing) { return ing.foodId === foodId; })) {
          usingRecipe = rf;
          break;
        }
      }
      if (usingRecipe) {
        window.alert('这个食物是菜谱"' + usingRecipe.name + '"的原料，无法删除。请先修改该菜谱。');
        return;
      }
      if (!window.confirm('确定要删除"' + food.name + '"吗？')) return;
      state.foods = state.foods.filter(function (f) { return f.id !== foodId; });
      renderLibrary();
      saveState();
      return;
    }

    if (e.target.classList.contains("edit-food-btn")) {
      if (food.recipe) {
        openRecipeModal(food);
        return;
      }
      var info = row.querySelector(".library-info");
      var mac = food.macros || { p: 0, c: 0, f: 0 };
      info.innerHTML =
        '<input type="text" class="library-name-input" value="' + escapeHtml(food.name) + '">' +
        '<div class="library-macro-edit">' +
          '<input type="number" class="library-cal-input" min="0" step="0.01" value="' + food.calPerGram + '"> kcal/g' +
        "</div>" +
        '<div class="library-macro-edit">' +
          "蛋白<input type=\"number\" class=\"library-p-input\" min=\"0\" step=\"0.1\" value=\"" + round1(mac.p * 100) + '">' +
          "碳水<input type=\"number\" class=\"library-c-input\" min=\"0\" step=\"0.1\" value=\"" + round1(mac.c * 100) + '">' +
          "脂肪<input type=\"number\" class=\"library-f-input\" min=\"0\" step=\"0.1\" value=\"" + round1(mac.f * 100) + '"> g/100g' +
        "</div>";
      var actions = row.querySelector(".library-actions");
      actions.innerHTML = '<button class="icon-mini-btn save-food-btn" title="保存">✓</button>';
      return;
    }

    if (e.target.classList.contains("save-food-btn")) {
      var nameInput = row.querySelector(".library-name-input");
      var calInput = row.querySelector(".library-cal-input");
      var newName = nameInput.value.trim();
      var newCal = parseFloat(calInput.value);
      if (newName) food.name = newName;
      if (!isNaN(newCal) && newCal >= 0) food.calPerGram = newCal;
      var p100 = parseFloat(row.querySelector(".library-p-input").value);
      var c100 = parseFloat(row.querySelector(".library-c-input").value);
      var f100 = parseFloat(row.querySelector(".library-f-input").value);
      food.macros = {
        p: !isNaN(p100) && p100 >= 0 ? p100 / 100 : 0,
        c: !isNaN(c100) && c100 >= 0 ? c100 / 100 : 0,
        f: !isNaN(f100) && f100 >= 0 ? f100 / 100 : 0
      };
      renderLibrary();
      renderMeals();
      renderRing();
      saveState();
      return;
    }
  });

  document.getElementById("addFoodBtn").addEventListener("click", function () {
    var nameEl = document.getElementById("newFoodName");
    var calEl = document.getElementById("newFoodCal");
    var emojiEl = document.getElementById("newFoodEmoji");
    var name = nameEl.value.trim();
    var cal = parseFloat(calEl.value);
    if (!name) { window.alert("请输入食物名称"); return; }
    if (isNaN(cal) || cal < 0) { window.alert("请输入有效的每克卡路里数值"); return; }
    var pEl = document.getElementById("newFoodP");
    var cEl = document.getElementById("newFoodC");
    var fEl = document.getElementById("newFoodF");
    var p100 = parseFloat(pEl.value);
    var c100 = parseFloat(cEl.value);
    var f100 = parseFloat(fEl.value);
    state.foods.push({
      id: uid(), name: name, emoji: emojiEl.value, calPerGram: cal,
      macros: {
        p: !isNaN(p100) && p100 >= 0 ? p100 / 100 : 0,
        c: !isNaN(c100) && c100 >= 0 ? c100 / 100 : 0,
        f: !isNaN(f100) && f100 >= 0 ? f100 / 100 : 0
      },
      builtin: false
    });
    nameEl.value = "";
    calEl.value = "";
    pEl.value = "";
    cEl.value = "";
    fEl.value = "";
    renderLibrary();
    saveState();
  });

  // ---------- recipe modal ----------
  // draft: { foodId: null | existing food id, ingredients: [{foodId, grams}], cookedWeight: null|number }
  var recipeDraft = null;

  function openRecipeModal(existingFood) {
    if (existingFood) {
      recipeDraft = {
        foodId: existingFood.id,
        ingredients: existingFood.recipe.ingredients.map(function (ing) {
          return { foodId: ing.foodId, grams: ing.grams };
        }),
        cookedWeight: existingFood.recipe.cookedWeight
      };
      document.getElementById("recipeName").value = existingFood.name;
      document.getElementById("recipeModalTitle").textContent = "编辑菜谱";
      var emojiSel = document.getElementById("recipeEmoji");
      emojiSel.value = existingFood.emoji;
      if (emojiSel.value !== existingFood.emoji) emojiSel.selectedIndex = 0;
    } else {
      recipeDraft = { foodId: null, ingredients: [{ foodId: state.foods[0].id, grams: 0 }], cookedWeight: null };
      document.getElementById("recipeName").value = "";
      document.getElementById("recipeModalTitle").textContent = "创建菜谱";
      document.getElementById("recipeEmoji").selectedIndex = 0;
    }
    document.getElementById("recipeCookedWeight").value = recipeDraft.cookedWeight || "";
    renderRecipeIngredients();
    renderRecipeSummary();
    openModal("recipeModalOverlay");
  }

  function ingredientOptionsHtml(selectedId) {
    return state.foods.filter(function (f) {
      return f.id !== recipeDraft.foodId; // a recipe cannot contain itself
    }).map(function (f) {
      return '<option value="' + f.id + '"' + (f.id === selectedId ? " selected" : "") + ">" +
        f.emoji + " " + escapeHtml(f.name) + "</option>";
    }).join("");
  }

  function renderRecipeIngredients() {
    var box = document.getElementById("recipeIngredients");
    box.innerHTML = recipeDraft.ingredients.map(function (ing, idx) {
      var cal = ing.grams * getFood(ing.foodId).calPerGram;
      return (
        '<div class="food-item-row recipe-ing-row" data-idx="' + idx + '">' +
          '<div class="food-item-top">' +
            '<select class="food-select ing-select">' + ingredientOptionsHtml(ing.foodId) + "</select>" +
            '<input type="number" class="grams-number ing-grams" min="0" step="1" value="' + (ing.grams || "") + '">' +
            '<span class="unit-g">g</span>' +
            '<span class="item-kcal ing-kcal">' + Math.round(cal) + " kcal</span>" +
            '<button class="remove-item-btn ing-remove" title="删除">✕</button>' +
          "</div>" +
        "</div>"
      );
    }).join("") || '<p class="hint-text">点击下方按钮添加原料。</p>';
  }

  function recipeTotals() {
    var rawTotal = 0, cal = 0, p = 0, c = 0, f = 0;
    recipeDraft.ingredients.forEach(function (ing) {
      if (!(ing.grams > 0)) return;
      var food = getFood(ing.foodId);
      var m = food.macros || { p: 0, c: 0, f: 0 };
      rawTotal += ing.grams;
      cal += ing.grams * food.calPerGram;
      p += ing.grams * m.p;
      c += ing.grams * m.c;
      f += ing.grams * m.f;
    });
    var cooked = recipeDraft.cookedWeight > 0 ? recipeDraft.cookedWeight : rawTotal;
    return { rawTotal: rawTotal, cal: cal, p: p, c: c, f: f, cooked: cooked };
  }

  function renderRecipeSummary() {
    var t = recipeTotals();
    var summary = document.getElementById("recipeSummary");
    if (t.rawTotal <= 0) {
      summary.innerHTML = '<div class="meal-summary-row"><span>合计</span><span>请先输入原料克数</span></div>';
      return;
    }
    var per100 = t.cooked > 0 ? 100 / t.cooked : 0;
    summary.innerHTML =
      '<div class="meal-summary-row">' +
        "<span>原料合计</span>" +
        '<span class="meal-summary-total">' + Math.round(t.rawTotal) + " g · " + Math.round(t.cal) + " kcal</span>" +
      "</div>" +
      '<div class="meal-summary-row meal-summary-macros">' +
        "<span>成品按 " + Math.round(t.cooked) + " g 计</span>" +
        "<span>每100g：" + Math.round(t.cal * per100) + " kcal · 蛋白 " + round1(t.p * per100) +
        " · 碳水 " + round1(t.c * per100) + " · 脂肪 " + round1(t.f * per100) + " g</span>" +
      "</div>";
  }

  document.getElementById("openRecipeBtn").addEventListener("click", function () {
    openRecipeModal(null);
  });

  document.getElementById("addIngredientBtn").addEventListener("click", function () {
    recipeDraft.ingredients.push({ foodId: state.foods[0].id, grams: 0 });
    renderRecipeIngredients();
    renderRecipeSummary();
  });

  document.getElementById("recipeIngredients").addEventListener("change", function (e) {
    var row = e.target.closest(".recipe-ing-row");
    if (!row) return;
    var idx = parseInt(row.dataset.idx, 10);
    if (e.target.classList.contains("ing-select")) {
      recipeDraft.ingredients[idx].foodId = e.target.value;
      renderRecipeIngredients();
      renderRecipeSummary();
    }
  });

  document.getElementById("recipeIngredients").addEventListener("input", function (e) {
    var row = e.target.closest(".recipe-ing-row");
    if (!row) return;
    var idx = parseInt(row.dataset.idx, 10);
    if (e.target.classList.contains("ing-grams")) {
      var g = parseFloat(e.target.value);
      recipeDraft.ingredients[idx].grams = isNaN(g) || g < 0 ? 0 : g;
      var ing = recipeDraft.ingredients[idx];
      row.querySelector(".ing-kcal").textContent =
        Math.round(ing.grams * getFood(ing.foodId).calPerGram) + " kcal";
      renderRecipeSummary();
    }
  });

  document.getElementById("recipeIngredients").addEventListener("click", function (e) {
    if (!e.target.classList.contains("ing-remove")) return;
    var row = e.target.closest(".recipe-ing-row");
    recipeDraft.ingredients.splice(parseInt(row.dataset.idx, 10), 1);
    renderRecipeIngredients();
    renderRecipeSummary();
  });

  document.getElementById("recipeCookedWeight").addEventListener("input", function (e) {
    var v = parseFloat(e.target.value);
    recipeDraft.cookedWeight = isNaN(v) || v <= 0 ? null : v;
    renderRecipeSummary();
  });

  document.getElementById("saveRecipeBtn").addEventListener("click", function () {
    var name = document.getElementById("recipeName").value.trim();
    if (!name) { window.alert("请输入菜品名称"); return; }
    var ings = recipeDraft.ingredients.filter(function (ing) { return ing.grams > 0; });
    if (!ings.length) { window.alert("请至少添加一种原料并输入克数"); return; }
    var t = recipeTotals();
    if (!(t.cooked > 0)) { window.alert("成品重量无效"); return; }
    var calPerGram = Math.round(t.cal / t.cooked * 100) / 100;
    var macros = {
      p: Math.round(t.p / t.cooked * 10000) / 10000,
      c: Math.round(t.c / t.cooked * 10000) / 10000,
      f: Math.round(t.f / t.cooked * 10000) / 10000
    };
    var emoji = document.getElementById("recipeEmoji").value;
    var recipeData = { ingredients: ings, cookedWeight: recipeDraft.cookedWeight };
    if (recipeDraft.foodId) {
      var food = getFood(recipeDraft.foodId);
      food.name = name;
      food.emoji = emoji;
      food.calPerGram = calPerGram;
      food.macros = macros;
      food.recipe = recipeData;
    } else {
      state.foods.push({
        id: uid(), name: name, emoji: emoji,
        calPerGram: calPerGram, macros: macros,
        recipe: recipeData, builtin: false
      });
    }
    saveState();
    closeModal("recipeModalOverlay");
    renderLibrary();
    renderMeals();
    renderRing();
  });

  // ---------- modal close wiring ----------
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () { closeModal(btn.dataset.close); });
  });
  document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach(function (o) { closeModal(o.id); });
    }
  });

  // ---------- meal card click ----------
  document.getElementById("mealsGrid").addEventListener("click", function (e) {
    var card = e.target.closest(".meal-card");
    if (!card) return;
    openMealModal(card.dataset.mealId);
  });

  // ---------- init ----------
  function init() {
    state = loadState();
    document.getElementById("todayDate").textContent = todayDisplay();
    refreshAll();
  }

  init();
})();
