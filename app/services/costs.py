from __future__ import annotations

from app.core.config import get_runtime


class CostService:
    def estimate(self, prompt_tokens: int, completion_tokens: int) -> float:
        runtime = get_runtime()
        cfg = runtime.yaml.cost_control
        input_cost = prompt_tokens / 1_000_000 * cfg.estimated_input_cost_per_1m
        output_cost = completion_tokens / 1_000_000 * cfg.estimated_output_cost_per_1m
        return round(input_cost + output_cost, 6)


cost_service = CostService()
