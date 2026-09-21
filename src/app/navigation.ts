import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Единый возврат для внутренней кнопки и Telegram BackButton. Внутренняя история определяется по индексу
 * маршрутизатора, а не по `history.length`, который включает внешние страницы; без истории — на «Сегодня».
 */
export function useGoBack() {
  const navigate = useNavigate();
  return useCallback(() => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) void navigate(-1);
    else void navigate("/", { replace: true });
  }, [navigate]);
}
