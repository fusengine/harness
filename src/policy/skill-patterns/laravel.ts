/**
 * Laravel skill-trigger patterns, ported verbatim from `laravel_patterns.py`
 * (consumed by `laravel_skill_triggers.py`). Matched case-insensitively.
 */

/** Map of Laravel sub-skill name → triggering PHP code patterns. */
export const LARAVEL_TRIGGERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "fusecore": ["FuseCore\\\\[A-Za-z]+\\\\App\\\\", "use HasModule\\b",
    "ModuleServiceProvider\\b", "ModuleInterface\\b"],
  "laravel-eloquent": ["(extends Model|HasFactory|belongsTo|hasMany|hasOne|morphTo)\\b",
    "\\$this->belongsToMany|->with\\(|->whereHas\\(",
    "(Eloquent|Model)::(find|where|create|update|all)\\b"],
  "laravel-api": ["(JsonResource|ResourceCollection|apiResource)\\b",
    "Route::(get|post|put|delete|apiResource)\\(",
    "(response\\(\\)->json|Request \\$request)\\b"],
  "laravel-auth": ["(Auth::|auth\\(\\)|Sanctum|Passport|Socialite)\\b",
    "(Gate::|Policy|can\\(|authorize)\\b",
    "(middleware\\(['\"]auth|LoginController|RegisterController)\\b"],
  "laravel-livewire": ["(extends Component|Livewire|wire:|#\\[On)\\b",
    "(mount|render|emit|dispatch)\\(\\)", "@livewire|<livewire:"],
  "laravel-queues": ["(implements ShouldQueue|dispatch\\(|Bus::)\\b",
    "(Queue::|Job|Batch|Chain)\\b", "(onQueue|onConnection|tries|backoff)\\b"],
  "laravel-billing": ["(Billable|subscription|Cashier)\\b",
    "(createSubscription|newSubscription|charge)\\("],
  "laravel-stripe-connect": ["(StripeConnect|connectAccount|onboardingUrl)\\b",
    "(paymentIntent|transfer|payout|splitPayment)\\b",
    "Stripe\\\\\\\\(Account|Transfer|PaymentIntent)\\b"],
  "laravel-testing": ["(extends TestCase|RefreshDatabase|WithFaker)\\b",
    "(assertStatus|assertJson|assertSee|assertRedirect)\\(",
    "(factory\\(|Pest|it\\(|test\\(|expect\\()\\b"],
  "laravel-migrations": ["(Schema::|Blueprint|->table|->create)\\b",
    "(->string|->integer|->boolean|->foreignId|->index)\\(", "extends Migration\\b"],
  "laravel-blade": ["(@extends|@section|@yield|@component|@slot)\\b",
    "(@if|@foreach|@include|@push|@stack)\\b", "(Blade::|x-[a-z])\\b"],
  "laravel-permission": ["(hasRole|givePermissionTo|assignRole|spatie)\\b",
    "(Permission|Role)::(create|findByName)\\b", "@can\\b|@role\\b|middleware.*role:"],
  "laravel-i18n": ["(__\\(|trans\\(|trans_choice\\(|@lang)\\b",
    "Lang::|->locale\\(|setLocale\\b"],
  "laravel-vite": ["(@vite|@viteReactRefresh|Vite::)\\b"],
};
