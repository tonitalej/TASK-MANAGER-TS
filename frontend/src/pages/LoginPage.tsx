import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Field, { describedBy } from '../components/Field';
import PageHeading from '../components/PageHeading';
import { useFlashMessage } from '../components/FlashMessage';
import { focusFirstError, splitServerError } from '../formErrors';
import { validateLogin, type Errors } from '../validation';

const FIELDS = ['email', 'password'] as const;
type LoginField = (typeof FIELDS)[number];

export default function LoginPage() {
  const { login } = useAuth();
  const notice = useFlashMessage(); // e.g. "Your session has expired"
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors<LoginField>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const clientErrors = validateLogin(values);
    setErrors(clientErrors);
    setFormError('');
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(FIELDS, clientErrors);
      return;
    }
    setSubmitting(true);
    try {
      // On success GuestRoute sees the logged-in user and redirects; this page is unmounted.
      await login({ email: values.email.trim(), password: values.password });
    } catch (err) {
      const { fieldErrors, message } = splitServerError(err, FIELDS);
      setErrors(fieldErrors);
      setFormError(message);
      setSubmitting(false);
    }
  }

  return (
    <main className="card auth">
      <PageHeading>Log in</PageHeading>
      {notice && <p className="flash" role="status">{notice}</p>}
      <form noValidate onSubmit={(e) => { void submit(e); }}>
        <Field id="email" label="Email" error={errors.email}>
          <input {...describedBy('email', errors.email)} type="email" autoComplete="email" value={values.email}
            onChange={(e) => { setValues({ ...values, email: e.target.value }); }} />
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          <input {...describedBy('password', errors.password)} type="password" autoComplete="current-password" value={values.password}
            onChange={(e) => { setValues({ ...values, password: e.target.value }); }} />
        </Field>
        {formError && <p className="error" role="alert">{formError}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="small">No account yet? <Link to="/register">Create one</Link></p>
    </main>
  );
}
