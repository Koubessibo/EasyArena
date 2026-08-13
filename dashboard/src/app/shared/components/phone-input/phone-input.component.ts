import { Component, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-phone-input',
  standalone: true,
  template: `
    <div class="phone-input-wrap">
      <span class="phone-input-prefix">+221</span>
      <input
        type="tel"
        class="phone-input-field"
        maxlength="9"
        placeholder="7X XXX XX XX"
        [value]="localValue()"
        (input)="onInput($any($event.target).value)"
        (blur)="onTouched()">
    </div>
  `,
  styles: [`
    .phone-input-wrap {
      display: flex;
      align-items: center;
      border: 1px solid var(--border-color, #d1d5db);
      border-radius: var(--border-radius, 0.5rem);
      overflow: hidden;
      background: var(--input-bg, #fff);
      transition: border-color 0.2s;
    }
    .phone-input-wrap:focus-within {
      border-color: var(--primary-color, #10b981);
    }
    .phone-input-prefix {
      padding: 0.625rem 0.5rem 0.625rem 0.875rem;
      color: var(--text-muted, #9ca3af);
      font-weight: 600;
      font-size: 0.9375rem;
      user-select: none;
      white-space: nowrap;
    }
    .phone-input-field {
      flex: 1;
      border: none;
      outline: none;
      padding: 0.625rem 0.875rem 0.625rem 0;
      font-size: 0.9375rem;
      background: transparent;
      color: var(--text-primary, #111827);
      min-width: 0;
    }
    .phone-input-field::placeholder {
      color: var(--text-placeholder, #d1d5db);
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PhoneInputComponent),
      multi: true,
    },
  ],
})
export class PhoneInputComponent implements ControlValueAccessor {
  localValue = signal('');
  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string): void {
    const raw = (value ?? '').replace(/^\+221/, '');
    this.localValue.set(raw);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onInput(val: string): void {
    const digits = val.replace(/\D/g, '').slice(0, 9);
    this.localValue.set(digits);
    this.onChange(digits ? `+221${digits}` : '');
  }
}
