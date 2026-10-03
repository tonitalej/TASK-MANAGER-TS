// ONE form for both "New task" and "Edit task".
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import Field, { describedBy } from './Field';
import { focusFirstError, splitServerError } from '../formErrors';
import type { TaskPayload } from '../types';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, validateTask, type Errors, type TaskField, type TaskFormValues } from '../validation';

const FIELDS: readonly TaskField[] = ['title', 'description', 'status', 'priority', 'due_date'];
const ID = 'task-'; // prefix for input ids

export const EMPTY_TASK: TaskFormValues = { title: '', description: '', status: 'todo', priority: 'medium', due_date: '' };

interface Props {
  initialValues: TaskFormValues;
  submitLabel: string;
  cancelTo: string;
  /** Throws (e.g. an ApiError) when saving fails; the form then shows the server's messages. */
  onSubmit: (payload: TaskPayload) => Promise<void>;
}

export default function TaskForm({ initialValues, submitLabel, cancelTo, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Errors<TaskField>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends TaskField>(field: K, value: TaskFormValues[K]) => { setValues({ ...values, [field]: value }); };

  const submit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const clientErrors = validateTask(values);
    setErrors(clientErrors);
    setFormError('');
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(FIELDS, clientErrors, ID);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        title: values.title.trim(),
        description: values.description.trim() ? values.description : null,
        status: values.status,
        priority: values.priority,
        due_date: values.due_date || null,
      });
      // On success the parent navigates away, so this component is unmounted.
    } catch (err) {
      const { fieldErrors, message } = splitServerError(err, FIELDS);
      setErrors(fieldErrors);
      setFormError(message);
      setSubmitting(false);
      focusFirstError(FIELDS, fieldErrors, ID);
    }
  }

  return (
    <form noValidate onSubmit={(e) => { void submit(e); }}>
      <Field id={`${ID}title`} label="Title" error={errors.title}>
        <input {...describedBy(`${ID}title`, errors.title)} value={values.title} maxLength={200}
          onChange={(e) => { set('title', e.target.value); }} />
      </Field>
      <Field id={`${ID}description`} label="Description (optional)" error={errors.description}>
        <textarea {...describedBy(`${ID}description`, errors.description)} rows={4} value={values.description} maxLength={5000}
          onChange={(e) => { set('description', e.target.value); }} />
      </Field>
      <div className="row fields">
        <Field id={`${ID}status`} label="Status" error={errors.status}>
          <select {...describedBy(`${ID}status`, errors.status)} value={values.status}
            onChange={(e) => { set('status', e.target.value as TaskFormValues['status']); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field id={`${ID}priority`} label="Priority" error={errors.priority}>
          <select {...describedBy(`${ID}priority`, errors.priority)} value={values.priority}
            onChange={(e) => { set('priority', e.target.value as TaskFormValues['priority']); }}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field id={`${ID}due_date`} label="Due date (optional)" error={errors.due_date}>
          <input {...describedBy(`${ID}due_date`, errors.due_date)} type="date" value={values.due_date}
            onChange={(e) => { set('due_date', e.target.value); }} />
        </Field>
      </div>
      {formError && <p className="error" role="alert">{formError}</p>}
      <div className="row">
        <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</button>
        <Link to={cancelTo} className="button secondary">Cancel</Link>
      </div>
    </form>
  );
}
