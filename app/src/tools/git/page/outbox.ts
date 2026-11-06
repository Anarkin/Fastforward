const keyRepeatDelay = 75;

export function settling<T>(
  post: (value: T) => void,
  delay = keyRepeatDelay,
): {
  settle: (value: T, repeat: boolean) => void;
  send: (value: T) => void;
  follow: (value: T) => void;
  pass: (value: T) => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T; followers: T[] } | undefined;
  const flush = () => {
    clearTimeout(timer);
    const held = pending;
    pending = undefined;
    if (held) {
      post(held.value);
      held.followers.forEach(post);
    }
  };
  return {
    settle: (value, repeat) => {
      clearTimeout(timer);
      pending = undefined;
      if (repeat) {
        pending = { value, followers: [] };
        timer = setTimeout(flush, delay);
      } else {
        post(value);
      }
    },
    send: (value) => {
      flush();
      post(value);
    },
    follow: (value) => {
      if (pending) {
        pending.followers.push(value);
      } else {
        post(value);
      }
    },
    pass: post,
  };
}
