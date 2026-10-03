import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Field, { describedBy } from '../components/Field';
import PageHeading from '../components/PageHeading';
import { focusFirstError, splitServerError } from '../formErrors';
import { validateRegister, type Errors } from '../validation';

const FIELDS = ['name', 'email', 'password'] as const;
type RegisterField = (typeof FIELDS)[number];
const PASSWORD_HINT = '8-72 characters, at least one letter and one number';

export default function RegisterPage() {
  const { register } = useAuth();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors<RegisterField>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const clientErrors = validateRegister(values);
    setErrors(clientErrors);
    setFormError('');
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(FIELDS, clientErrors);
      return;
    }
    setSubmitting(true);
    try {
      // On success GuestRoute sees the logged-in user and redirects to the dashboard.
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
    } catch (err) {
      const { fieldErrors, message } = splitServerError(err, FIELDS);
      setErrors(fieldErrors);
      setFormError(message);
      setSubmitting(false);
      focusFirstError(FIELDS, fieldErrors);
    }
  }

  const set = (field: RegisterField) => (e: { target: { value: string } }) => { setValues({ ...values, [field]: e.target.value }); };

  return (
    <main className="card auth">
      <PageHeading>Create an account</PageHeading>
      <form noValidate onSubmit={(e) => { void submit(e); }}>
        <Field id="name" label="Name" error={errors.name}>
          <input {...describedBy('name', errors.name)} autoComplete="name" value={values.name} onChange={set('name')} />
        </Field>
        <Field id="email" label="Email" error={errors.email}>
          <input {...describedBy('email', errors.email)} type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        </Field>
        <Field id="password" label="Password" error={errors.password} hint={PASSWORD_HINT}>
          <input {...describedBy('password', errors.password, PASSWORD_HINT)} type="password" autoComplete="new-password"
            value={values.password} onChange={set('password')} />
        </Field>
        {formError && <p className="error" role="alert">{formError}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="small">Already have an account? <Link to="/login">Log in</Link></p>
    </main>
  );
}
