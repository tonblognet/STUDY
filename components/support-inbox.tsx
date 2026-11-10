"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { accountRequest } from "@/lib/account/client";
import { SupportTicketForm } from "./support-ticket-form";
import {
  ticketCategoryLabels,
  ticketPriorities,
  ticketPriorityLabels,
  ticketStatuses,
  ticketStatusLabels,
  terminalTicket,
  type SupportMessageView,
  type SupportTicketView,
} from "@/lib/support/policy";
import styles from "./support.module.css";

function date(value: string) {
  return (
    new Date(value).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }) + " МСК"
  );
}
export function SupportTicketMeta({ ticket }: { ticket: SupportTicketView }) {
  return (
    <div className={styles.meta}>
      <span>{ticketStatusLabels[ticket.status] ?? "Статус уточняется"}</span>
      <span>{ticketCategoryLabels[ticket.category] ?? "Другое"}</span>
      {ticket.responseDueAt && (
        <span className={ticket.sla === "overdue" ? styles.overdue : undefined}>
          Целевой ответ до {date(ticket.responseDueAt)}
          {ticket.sla === "overdue" ? " · срок прошёл" : ""}
        </span>
      )}
      {!ticket.responseDueAt && ticket.sla === "not_set" && (
        <span>Срок ответа не задан</span>
      )}
      {ticket.firstRespondedAt && (
        <span>Первый ответ: {date(ticket.firstRespondedAt)}</span>
      )}
    </div>
  );
}
type Thread = {
  ticket: SupportTicketView;
  messages: SupportMessageView[];
  page: number;
  hasMore: boolean;
};
type List = { tickets: SupportTicketView[]; page: number; hasMore: boolean };
const failureText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось загрузить обращения. Попробуйте позже";

export function SupportInbox({
  staff = false,
  showCreate = false,
}: {
  staff?: boolean;
  showCreate?: boolean;
}) {
  const base = staff ? "/api/admin/support/tickets" : "/api/support/tickets";
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [mine, setMine] = useState(false);
  const [list, setList] = useState<List | null>(null);
  const [listBusy, setListBusy] = useState(true);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadBusy, setThreadBusy] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const listSequence = useRef(0);
  const threadSequence = useRef(0);
  const threadVersion = useRef<number | undefined>(undefined);
  const invalidateList = useCallback(() => {
    listSequence.current++;
  }, []);
  const invalidateThread = useCallback(() => {
    threadSequence.current++;
  }, []);
  function prepareList() {
    setListBusy(true);
    setListError("");
  }
  const loadList = useCallback(() => {
    const sequence = ++listSequence.current;
    const query = new URLSearchParams({
      page: String(page),
      ...(filter ? { status: filter } : {}),
      ...(staff && mine ? { mine: "true" } : {}),
    });
    return accountRequest(`${base}?${query}`)
      .then((data) => {
        if (sequence === listSequence.current) setList(data);
      })
      .catch((error) => {
        if (sequence === listSequence.current) setListError(failureText(error));
      })
      .finally(() => {
        if (sequence === listSequence.current) setListBusy(false);
      });
  }, [base, page, filter, mine, staff]);
  const loadThread = useCallback(
    async (id: string, messagePage = 1, older = false) => {
      const sequence = ++threadSequence.current;
      try {
        const query = new URLSearchParams({
          page: String(messagePage),
          ...(older && threadVersion.current
            ? { version: String(threadVersion.current) }
            : {}),
        });
        const data: Thread = await accountRequest(`${base}/${id}?${query}`);
        if (sequence === threadSequence.current)
          threadVersion.current = data.ticket.version;
        if (sequence === threadSequence.current)
          setThread((current) =>
            older && current?.ticket.id === id
              ? { ...data, messages: [...data.messages, ...current.messages] }
              : data,
          );
      } catch (error) {
        if (sequence === threadSequence.current)
          setThreadError(failureText(error));
      } finally {
        if (sequence === threadSequence.current) setThreadBusy(false);
      }
    },
    [base],
  );
  useEffect(() => {
    void loadList();
    return invalidateList;
  }, [loadList, invalidateList]);
  useEffect(() => {
    if (selected) void loadThread(selected);
    return invalidateThread;
  }, [selected, loadThread, invalidateThread]);
  function selectTicket(id: string) {
    setThreadBusy(true);
    setThreadError("");
    setNotice("");
    if (id === selected) {
      void loadThread(id);
      return;
    }
    setThread(null);
    setSelected(id);
  }
  function refreshThread(id: string, page = 1, older = false) {
    setThreadBusy(true);
    setThreadError("");
    void loadThread(id, page, older);
  }
  async function mutate(method: string, payload: Record<string, unknown>) {
    if (!thread || busy) return;
    const id = thread.ticket.id;
    const version = thread.ticket.version;
    setBusy(true);
    setThreadError("");
    setNotice("");
    try {
      await accountRequest(`${base}/${id}`, method, { ...payload, version });
      if (method === "POST") setDrafts((current) => ({ ...current, [id]: "" }));
      setNotice(
        method === "POST" ? "Сообщение сохранено" : "Обращение обновлено",
      );
      await Promise.all([loadThread(id), loadList()]);
    } catch (error) {
      setThreadError(failureText(error));
    } finally {
      setBusy(false);
    }
  }
  function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected) void mutate("POST", { message: drafts[selected] ?? "" });
  }
  function created(id: string) {
    selectTicket(id);
    setPage(1);
    void loadList();
  }
  const current = thread?.ticket;
  return (
    <div className={styles.center}>
      {showCreate && (
        <section aria-labelledby="support-create-heading">
          <h2 id="support-create-heading">Создать обращение</h2>
          <SupportTicketForm onCreated={created} />
        </section>
      )}
      <section id="history" aria-labelledby="support-history-heading">
        <h2 id="support-history-heading">
          {staff ? "Очередь обращений" : "История обращений"}
        </h2>
        <p className={styles.hint}>
          Ответы сохраняются здесь. Срок ответа — операционная цель;
          окончательные часы работы поддержки будут опубликованы перед запуском.
        </p>
        <div className={styles.workspace}>
          <div className={styles.list} aria-busy={listBusy}>
            <div className={styles.filters}>
              <label>
                Статус
                <select
                  value={filter}
                  disabled={busy}
                  onChange={(event) => {
                    prepareList();
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Все статусы</option>
                  {ticketStatuses.map((status) => (
                    <option value={status} key={status}>
                      {ticketStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              {staff && (
                <label>
                  <input
                    type="checkbox"
                    checked={mine}
                    disabled={busy}
                    onChange={(event) => {
                      prepareList();
                      setMine(event.target.checked);
                      setPage(1);
                    }}
                  />
                  Только назначенные мне
                </label>
              )}
            </div>
            <button
              type="button"
              className="button button-secondary"
              disabled={listBusy || busy}
              onClick={() => {
                prepareList();
                void loadList();
              }}
            >
              Обновить список
            </button>
            {listError && (
              <p role="alert" className={styles.feedback}>
                {listError}
              </p>
            )}
            {listBusy && <p role="status">Загружаем обращения…</p>}
            {!listBusy && !listError && list?.tickets.length === 0 && (
              <p className={styles.empty}>
                Обращений пока нет.{" "}
                {staff
                  ? "Попробуйте другой фильтр."
                  : "Создайте обращение, если нужна помощь."}
              </p>
            )}
            <ul className={styles.tickets}>
              {list?.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    className={styles.ticket}
                    disabled={busy}
                    aria-pressed={selected === ticket.id}
                    onClick={() => selectTicket(ticket.id)}
                  >
                    <strong>{ticket.subject}</strong>
                    <span>
                      {ticketStatusLabels[ticket.status] ?? "Статус уточняется"}
                    </span>
                    <small>Обновлено {date(ticket.updatedAt)}</small>
                    {staff && (
                      <small>
                        {ticketPriorityLabels[ticket.priority] ??
                          ticket.priority}{" "}
                        ·{" "}
                        {ticket.assignedToMe
                          ? "Назначено вам"
                          : ticket.hasAssignee
                            ? "Назначено сотруднику"
                            : "Не назначено"}
                      </small>
                    )}
                    {ticket.sla === "overdue" && (
                      <span className={styles.overdue}>
                        Целевой срок ответа прошёл
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {list && (
              <div className={styles.pagination}>
                <button
                  className="button button-secondary"
                  disabled={page === 1 || listBusy || busy}
                  onClick={() => {
                    prepareList();
                    setPage(page - 1);
                  }}
                >
                  Назад
                </button>
                <span>Страница {page}</span>
                <button
                  className="button button-secondary"
                  disabled={!list.hasMore || page === 1000 || listBusy || busy}
                  onClick={() => {
                    prepareList();
                    setPage(page + 1);
                  }}
                >
                  Далее
                </button>
              </div>
            )}
          </div>
          <div className={styles.thread} aria-busy={threadBusy || busy}>
            {!selected && (
              <p className={styles.empty}>
                Выберите обращение, чтобы открыть переписку.
              </p>
            )}
            {selected && (
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy || threadBusy}
                  onClick={() => refreshThread(selected)}
                >
                  Обновить переписку
                </button>
              </div>
            )}
            {threadBusy && <p role="status">Загружаем переписку…</p>}
            {threadError && (
              <p role="alert" className={styles.feedback}>
                {threadError}
              </p>
            )}
            {notice && (
              <p role="status" className={styles.feedback}>
                {notice}
              </p>
            )}
            {thread && current && (
              <>
                <h2>{current.subject}</h2>
                <SupportTicketMeta ticket={current} />
                <p className={styles.hint}>Номер обращения: {current.id}</p>
                {thread.hasMore && (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy || threadBusy}
                    onClick={() =>
                      refreshThread(current.id, thread.page + 1, true)
                    }
                  >
                    Показать предыдущие сообщения
                  </button>
                )}
                <ol className={styles.messages}>
                  {thread.messages.map((message) => (
                    <li
                      className={styles.message}
                      data-owner={message.fromOwner}
                      key={message.id}
                    >
                      <header>
                        <strong>
                          {message.fromViewer
                            ? "Вы"
                            : message.fromOwner
                              ? "Пользователь"
                              : "Поддержка"}
                        </strong>
                        <time
                          className={styles.date}
                          dateTime={message.createdAt}
                        >
                          {date(message.createdAt)}
                        </time>
                      </header>
                      <p className={styles.body}>{message.body}</p>
                    </li>
                  ))}
                </ol>
                <form className={styles.form} onSubmit={reply} aria-busy={busy}>
                  <label>
                    Сообщение
                    <textarea
                      name="message"
                      required
                      minLength={1}
                      maxLength={5000}
                      rows={5}
                      disabled={busy}
                      value={drafts[current.id] ?? ""}
                      onChange={(event) =>
                        setDrafts((draft) => ({
                          ...draft,
                          [current.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="button button-primary"
                    disabled={busy || threadBusy}
                  >
                    {busy ? "Сохраняем…" : "Отправить сообщение"}
                  </button>
                  <p className={styles.hint}>
                    Не отправляйте пароль, одноразовые коды или полные реквизиты
                    карты. Новое сообщение по решённому обращению откроет его
                    снова.
                  </p>
                </form>
                {staff ? (
                  <StaffControls
                    key={`${current.id}:${current.version}`}
                    ticket={current}
                    busy={busy || threadBusy}
                    update={(payload) => void mutate("PATCH", payload)}
                  />
                ) : (
                  <div className={styles.toolbar}>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy || threadBusy}
                      onClick={() =>
                        void mutate("PATCH", {
                          status: terminalTicket(current.status)
                            ? "OPEN"
                            : "CLOSED",
                        })
                      }
                    >
                      {terminalTicket(current.status)
                        ? "Открыть снова"
                        : "Закрыть обращение"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
function StaffControls({
  ticket,
  busy,
  update,
}: {
  ticket: SupportTicketView;
  busy: boolean;
  update(payload: Record<string, unknown>): void;
}) {
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        update({ status, priority });
      }}
    >
      <fieldset disabled={busy}>
        <legend>Работа с обращением</legend>
        <label>
          Рабочий статус
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {ticketStatuses
              .filter(
                (value) =>
                  value !== "WAITING_USER" || ticket.status === "WAITING_USER",
              )
              .map((value) => (
                <option key={value} value={value}>
                  {ticketStatusLabels[value]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Приоритет
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            {ticketPriorities.map((value) => (
              <option key={value} value={value}>
                {ticketPriorityLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-secondary">
          Сохранить статус и приоритет
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() =>
            update({ assignment: ticket.assignedToMe ? "unassigned" : "self" })
          }
        >
          {ticket.assignedToMe
            ? "Снять назначение"
            : ticket.hasAssignee
              ? "Переназначить на себя"
              : "Взять в работу"}
        </button>
      </fieldset>
    </form>
  );
}
