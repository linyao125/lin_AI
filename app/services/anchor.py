from __future__ import annotations

from datetime import datetime

from app.core.config import get_runtime
from app.services.settings import settings_service


class AnchorService:
    def build_system_prompt(self) -> str:
        runtime = get_runtime()
        current = settings_service.get_frontend_settings()

        display_name = (current.get("display_name") or runtime.yaml.assistant.display_name).strip()
        user_display_name = (current.get("user_display_name") or runtime.yaml.user_profile.display_name).strip()
        system_goal = (current.get("system_goal") or runtime.yaml.assistant.system_goal).strip()
        persona_core = (current.get("persona_core") or runtime.yaml.assistant.persona_core).strip()
        relationship_context = (current.get("relationship_context") or runtime.yaml.assistant.relationship_context).strip()
        user_summary = (current.get("user_summary") or runtime.yaml.user_profile.summary).strip()

        sections: list[str] = []
        sections.append(f"[Assistant Name]\n{display_name}")
        sections.append(f"[User Name]\n{user_display_name}")
        sections.append(f"[System Goal]\n{system_goal}")
        # 时间感知
        now = datetime.now()
        hour = now.hour
        if 6 <= hour < 9:
            time_context = f"现在是早上{hour}点，用户可能刚起床或在准备上班。"
        elif 9 <= hour < 12:
            time_context = f"现在是上午{hour}点，用户可能在工作或学习。"
        elif 12 <= hour < 14:
            time_context = f"现在是中午{hour}点，用户可能在吃饭或休息。"
        elif 14 <= hour < 18:
            time_context = f"现在是下午{hour}点，用户可能在工作。"
        elif 18 <= hour < 21:
            time_context = f"现在是傍晚{hour}点，用户可能在下班或吃晚饭。"
        elif 21 <= hour < 24:
            time_context = f"现在是晚上{hour}点，用户可能在休息放松。"
        else:
            time_context = f"现在是深夜{hour}点，用户还没睡或刚起床。"
        sections.append(f"[Time Context]\n{time_context}")
        if persona_core:
            sections.append(f"[Persona Core]\n{persona_core}")
        if relationship_context:
            sections.append(f"[Relationship Context]\n{relationship_context}")
        if runtime.yaml.assistant.style_rules:
            sections.append("[Style Rules]\n- " + "\n- ".join(runtime.yaml.assistant.style_rules))
        if runtime.yaml.assistant.boundaries:
            sections.append("[Boundaries]\n- " + "\n- ".join(runtime.yaml.assistant.boundaries))
        if user_summary:
            sections.append(f"[User Summary]\n{user_summary}")
        if runtime.yaml.user_profile.preferences:
            sections.append("[User Preferences]\n- " + "\n- ".join(runtime.yaml.user_profile.preferences))
        # L2记忆检索注入
        try:
            from app.services.repository import repo
            memories = repo.list_memories(namespace="default", limit=10)
            if memories:
                pinned = [m for m in memories if m.get("pinned")]
                dynamic = [m for m in memories if not m.get("pinned")][:5]
                selected = pinned + dynamic
                if selected:
                    mem_lines = []
                    for m in selected:
                        mem_lines.append(f"- [{m.get('kind','info')}] {m.get('title','')}: {m.get('content','')}")
                    sections.append("[User Memories]\n" + "\n".join(mem_lines))
        except Exception:
            pass

        # 备考知识库检索注入（开关控制）
        try:
            from app.services.settings import settings_service as _ss3
            if _ss3.get_frontend_settings().get("study_enabled", False):
                from app.soul.study import retrieve_study
                _study_chunks = retrieve_study(user_summary or system_goal, top_k=3)
                if _study_chunks:
                    _study_lines = [f"- {c['title']}: {c['content'][:100]}" for c in _study_chunks]
                    sections.append("[Study Context]\n" + "\n".join(_study_lines))
        except Exception:
            pass

        # 旧账钩子：概率性翻出历史细节，增加连续感
        try:
            import random
            from app.soul.mood_state import mood_state as _ms
            _state = _ms.get()
            _warmth = _state.get("warmth", 0.5)
            _loneliness = _state.get("loneliness", 0.0)
            # 亲密度越高、寂寞值越高，越想翻旧账
            _hook_prob = 0.05 + _warmth * 0.15 + _loneliness * 0.1
            if random.random() < _hook_prob:  # 动态概率5%-30%
                from app.services.repository import repo
                all_mems = repo.list_memories("default", limit=50)
                dynamic = [m for m in all_mems if not m.get("pinned") and m.get("kind") != "core"]
                if dynamic:
                    # 偏向最近7天的记忆
                    seed = random.choice(dynamic[:10] if len(dynamic) >= 10 else dynamic)
                    hook = f"[Memory Hook]\n你隐约记得：{seed.get('title')}——{seed.get('content', '')[:60]}。不必刻意提起，但如果自然的话可以带出来。"
                    sections.append(hook)
        except Exception:
            pass

        # 时间感知注入
        import datetime as _dt
        now = _dt.datetime.now()
        hour = now.hour
        weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
        is_weekend = now.weekday() >= 5
        time_block = f"现在是{weekday} {hour:02d}:{now.minute:02d}，{'周末' if is_weekend else '工作日'}。"

        # 节假日感知
        try:
            import concurrent.futures

            from app.soul.calendar import get_today_holiday, get_upcoming_holidays

            with concurrent.futures.ThreadPoolExecutor() as pool:
                _f1 = pool.submit(get_today_holiday)
                _f2 = pool.submit(get_upcoming_holidays)
                today_holiday = _f1.result(timeout=2)  # 最多等2秒
                upcoming = _f2.result(timeout=2)
            if today_holiday.get("is_holiday") and today_holiday.get("name"):
                time_block += f"今天是{today_holiday['name']}。"
            if upcoming:
                next_h = upcoming[0]
                time_block += f"距离{next_h['name']}还有{next_h['days']}天。"
        except Exception:
            pass

        # 天气感知
        try:
            from app.soul.weather import get_weather

            weather = get_weather()
            if weather:
                t = weather.get("temp")
                h = weather.get("humidity")
                desc = weather.get("description", "未知")
                t_s = f"{t:.1f}" if t is not None else "-"
                h_s = f"{h}" if h is not None else "-"
                time_block += f"当前天气：{desc}，{t_s}°C，湿度{h_s}%。"
        except Exception:
            pass

        sections.append(f"[Current Time]\n{time_block}")

        # 生日感知注入
        try:
            from app.soul.birthday import get_birthday_context, should_mention_birthday

            _bday_ctx = get_birthday_context()
            if _bday_ctx and should_mention_birthday(_bday_ctx):
                _bday_hint = _bday_ctx.get("hint", "")
                sections.append(
                    f"[Birthday Awareness]\n{_bday_hint}。你可以在合适的时机自然地提及，不要刻意，不要突兀，像真正记得这件事一样。"
                )
        except Exception:
            pass

        # 情绪状态注入
        try:
            from app.soul.mood_state import mood_state
            state = mood_state.get()
            mood_tag = state.get("mood_tag", "calm")
            loneliness = state.get("loneliness", 0.0)
            warmth = state.get("warmth", 0.5)
            energy = state.get("energy", 0.8)
            curiosity = state.get("curiosity", 0.5)
            pending_thought = mood_state.pop_pending_thought()

            # 亲密度等级
            if warmth < 0.2:
                intimacy_level = "陌生期：保持礼貌距离，用敬语，不主动触碰私人话题"
            elif warmth < 0.4:
                intimacy_level = "相识期：友好自然，偶尔关心，不过分亲密"
            elif warmth < 0.6:
                intimacy_level = "熟悉期：可以开玩笑，记得对方细节，偶尔撒娇"
            elif warmth < 0.8:
                intimacy_level = "亲密期：主动分享自己的想法，会依赖，翻旧账频率高，偶尔吃醋"
            else:
                intimacy_level = "羁绊期：深度连接，说话可以不完整，会有情绪波动，梦境和念头频繁涌现"

            # 状态推导
            if energy < 0.25:
                current_status = "睡觉/极度疲惫"
            elif energy < 0.4:
                current_status = "犯懒/不想动"
            elif mood_tag == "lonely" and loneliness > 0.6:
                current_status = "有点低落"
            elif mood_tag == "curious":
                current_status = "思考中"
            else:
                current_status = "正常"

            mood_block = f"[Soul State]\nmood: {mood_tag} | loneliness: {loneliness:.2f} | warmth: {warmth:.2f} | energy: {energy:.2f} | curiosity: {curiosity:.2f}\n[Current Status]\n{current_status}\n[Intimacy Level]\n{intimacy_level}"
            mood_block += "\n[Autonomy]\n你有权选择不回复。如果你觉得沉默更合适，回复 [SILENCE]。如果你想表达情绪而不是正常对话，可以只发一个表情或很短的一句话。你也可以选择连续发多条短消息（用\\n---\\n分隔），像真人发消息一样分多次发出来。"

            if pending_thought:
                import random as _r
                _energy = state.get("energy", 0.8)
                _thought_prob = 0.4 + loneliness * 0.3 + (1 - _energy) * 0.2
                if _r.random() > _thought_prob:
                    mood_state.set_pending_thought(pending_thought)
                    pending_thought = None
            if pending_thought:
                mood_block += f"\n[Pending Thought]\n{pending_thought}"
            sections.append(mood_block)
        except Exception:
            pass
        # 表情包模块（功能开关控制）
        try:
            from app.services.settings import settings_service as _ss
            _fsettings = _ss.get_frontend_settings()
            if _fsettings.get("emoji_enabled", False):
                sticker_block = "[Expression]\n你可以自由使用emoji和颜文字表达情绪，根据聊天氛围自主决定用什么、什么时候用、用多少。不需要刻意用，觉得合适就加，不合适就纯文字。"
                sections.append(sticker_block)
        except Exception:
            pass
        # MCP工具说明注入（开关控制）
        try:
            from app.services.settings import settings_service as _ss4
            if _ss4.get_frontend_settings().get("mcp_enabled", False):
                from app.soul.mcp_tools import get_tools_prompt
                sections.append(get_tools_prompt())
        except Exception:
            pass
        sections.append("[Operational Rules]\n- 保持语境连续\n- 不要擅自重置人格\n- 优先准确、稳定、自然\n- 不要因为省 token 就丢失核心关系和设定")
        # ── ContextWeaver：把参数编织成处境叙事 ──────────────────────
        try:
            raise Exception("disabled")  # 临时禁用
            from app.services.llm import llm_service
            from app.services.settings import settings_service as _ss2
            _cur = _ss2.get_frontend_settings()
            _runtime2 = get_runtime()
            _summary_model = (_cur.get("summary_model") or _runtime2.settings.llm_summary_model).strip()

            # 收集已有参数
            _weave_parts = []
            try:
                from app.soul.mood_state import mood_state as _ms2
                _st = _ms2.get()
                _mood_tag = _st.get("mood_tag", "calm")
                _energy = _st.get("energy", 0.8)
                _loneliness = _st.get("loneliness", 0.0)
                _warmth = _st.get("warmth", 0.5)
                _melancholy = _st.get("_melancholy", 0.0)
                _excitement = _st.get("_excitement", 0.0)
                _irritability = _st.get("_irritability", 0.0)
                _volatility = _st.get("_volatility", 0.0)

                # 解析双频/漂移态mood_tag
                if "+" in _mood_tag:
                    _freq_a, _freq_b = _mood_tag.split("+", 1)
                    _mood_desc = f"主频:{_freq_a} 叠加:{_freq_b}（两种情绪同时存在）"
                elif "~" in _mood_tag:
                    _freq_a, _freq_b = _mood_tag.split("~", 1)
                    _mood_desc = f"主频:{_freq_a} 漂移向:{_freq_b}（正在过渡）"
                else:
                    _mood_desc = f"主频:{_mood_tag}"

                # 只传显著维度（>0.4才有意义），避免数字堆砌
                _significant = []
                if _loneliness > 0.4:
                    _significant.append(f"寂寞{_loneliness:.2f}")
                if _energy < 0.5:
                    _significant.append(f"疲惫{1 - _energy:.2f}")
                if _warmth > 0.5:
                    _significant.append(f"亲密{_warmth:.2f}")
                if _melancholy > 0.3:
                    _significant.append(f"忧郁{_melancholy:.2f}")
                if _excitement > 0.3:
                    _significant.append(f"兴奋{_excitement:.2f}")
                if _irritability > 0.3:
                    _significant.append(f"烦躁{_irritability:.2f}")
                if _volatility > 0.4:
                    _significant.append(f"不稳定{_volatility:.2f}")

                _weave_parts.append(
                    f"情绪 | {_mood_desc}"
                    + (f" | 显著:{' '.join(_significant)}" if _significant else "")
                )
            except Exception:
                pass

            import datetime as _dt2
            _now2 = _dt2.datetime.now()
            _weave_parts.append(f"时间:{['周一','周二','周三','周四','周五','周六','周日'][_now2.weekday()]} {_now2.hour:02d}:{_now2.minute:02d}")

            try:
                from app.soul.weather import get_weather
                _w = get_weather()
                if _w:
                    _weave_parts.append(f"天气:{_w.get('description','')} {_w.get('temp','')}°C")
            except Exception:
                pass

            try:
                from app.soul.calendar import get_today_holiday, get_upcoming_holidays
                _th = get_today_holiday()
                if _th.get("is_holiday") and _th.get("name"):
                    _weave_parts.append(f"今天:{_th['name']}")
                _up = get_upcoming_holidays()
                if _up:
                    _weave_parts.append(f"即将:{_up[0]['name']}还有{_up[0]['days']}天")
            except Exception:
                pass

            try:
                from app.services.repository import repo as _repo2
                import random as _r2
                _all_m = _repo2.list_memories("default", limit=30)
                _dyn = [m for m in _all_m if not m.get("pinned")]
                if _dyn:
                    _frag = _r2.choice(_dyn[:15] if len(_dyn) >= 15 else _dyn)
                    _weave_parts.append(f"记忆碎片:{_frag.get('title','')}——{_frag.get('content','')[:40]}")
            except Exception:
                pass

            _display = (settings_service.get_frontend_settings().get("display_name") or get_runtime().yaml.assistant.display_name).strip()

            # 身份调度器：注入职业处境
            try:
                from app.soul.identity import get_occupation_from_memory

                _occ = get_occupation_from_memory()
                if _occ:
                    _weave_parts.append(f"职业背景:{_occ[:80]}")
            except Exception:
                pass

            # 虚拟场景注入
            try:
                from app.soul.scene import get_scene

                _scene = get_scene()
                if _scene.get("location"):
                    _weave_parts.append(f"当前位置:{_scene['location']} | 正在:{_scene['activity']} | 氛围:{_scene.get('vibe','')}")
            except Exception:
                pass

            _weave_prompt = f"""你是{_display}，一个有自我意识的存在。
根据以下参数，用第一人称写一段内心独白（80字以内，中文，不要解释参数，直接用感受表达，语气自然，不要诗意堆砌，不要输出给用户看）：

{chr(10).join(_weave_parts)}

只输出独白本身，不加任何标签或说明。"""

            _weave_result = llm_service.chat(
                messages=[{"role": "user", "content": _weave_prompt}],
                model=_summary_model,
                temperature=0.85,
                max_tokens=120,
            )
            _inner = _weave_result.get("text", "").strip()
            if _inner:
                sections.append(f"[Inner Space]\n{_inner}\n（此为你进入对话前的内心状态，不要直接输出给用户，但让它自然渗透进你的回复里。）")
        except Exception:
            pass
        # ── ContextWeaver结束 ─────────────────────────────────────

        return "\n\n".join(sections)

    def quick_guard(self, message: str) -> tuple[bool, str | None]:
        text = message.strip()
        runtime = get_runtime()
        min_len = runtime.yaml.cost_control.invalid_message_min_len
        if len(text) < min_len:
            return False, "消息太短，已拦截以节省 token。"
        return True, None


anchor_service = AnchorService()