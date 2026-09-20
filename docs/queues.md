# Queue setup

The Worker expects one primary Queue:

```text
vidox-jobs
```

Create it with:

```bash
npx wrangler queues create vidox-jobs
```

The Worker configuration uses:

- batch size: 1
- max concurrency: 2
- max retries: 3
- retry delay: 60 seconds
- DLQ: `vidox-jobs-dlq`

The queue consumer resets a transient `downloading` job to `pending` before calling `message.retry()`, so a redelivered message can claim the job again.
