// OTP code generation for the Authenticator PWA.
// Port of src/models/key-utilities.ts (KeyUtilities.generate) to C++,
// using fast_io's SHA-1/SHA-256/SHA-512 contexts for HMAC.
//
// Build: clang++ --config=$HOME/cfgs/wasm32-wasip1-noeh-nomtg.cfg \
//          -Os -msimd128 -nostartfiles -Wl,--no-entry \
//          -Wl,--export=__wasm_call_ctors \
//          -Wl,--export=otp_input -Wl,--export=otp_output \
//          -Wl,--export=otp_generate -o otp.wasm otp.cpp
//
// ABI: JS writes the secret as ASCII bytes into otp_input(), then calls
// otp_generate(); the resulting code string is read from otp_output().
// JS must call __wasm_call_ctors() once after instantiation.

#include <cstdint>
#include <cstddef>
#include <fast_io_crypto.h>

namespace
{

inline constexpr std::size_t max_secret_size{4096};
inline constexpr std::size_t max_hex_size{max_secret_size * 8 / 5 + 8};
inline constexpr std::size_t max_output_size{32};

std::byte input_buffer[max_secret_size];
char output_buffer[max_output_size];

enum class otp_type : ::std::uint32_t
{
	totp = 1,
	hotp = 2,
	battle = 3,
	steam = 4,
	hex = 5,
	hhex = 6,
};

enum class otp_algorithm : ::std::uint32_t
{
	sha1 = 1,
	sha256 = 2,
	sha512 = 3,
};

inline char hex_digit(::std::uint32_t v) noexcept
{
	return "0123456789abcdef"[v & 0xf];
}

// Faithful port of KeyUtilities.base32tohex: each base32 char contributes 5
// bits (top-down, MSB first), '=' contributes 5 zero bits and is counted as
// padding; trailing hex digits are then stripped according to padding.
// Returns number of hex chars written, or -1 on invalid padding.
inline ::std::int64_t base32_to_hex(char const *base32, ::std::size_t len, char *hex) noexcept
{
	constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	::std::uint_least64_t acc{};
	::std::size_t nbits{};
	::std::size_t hn{};
	::std::size_t padding{};

	for (::std::size_t i{}; i != len; ++i)
	{
		char c = base32[i];
		::std::uint32_t val{};
		if (c == '=')
		{
			++padding;
		}
		else
		{
			if (c >= 'a' && c <= 'z')
			{
				c = static_cast<char>(c - 'a' + 'A');
			}
			char const *found = nullptr;
			for (char const *p = alphabet; *p; ++p)
			{
				if (*p == c)
				{
					found = p;
					break;
				}
			}
			if (!found)
			{
				return -2;
			}
			val = static_cast<::std::uint32_t>(found - alphabet);
		}
		acc = (acc << 5) | val;
		nbits += 5;
		while (nbits >= 4)
		{
			nbits -= 4;
			hex[hn++] = hex_digit(static_cast<::std::uint32_t>(acc >> nbits) & 0xf);
		}
		acc &= (::std::uint_least64_t{1} << nbits) - 1;
	}

	switch (padding)
	{
	case 0:
		break;
	case 6:
		hn = hn < 8 ? 0 : hn - 8;
		break;
	case 4:
		hn = hn < 6 ? 0 : hn - 6;
		break;
	case 3:
		hn = hn < 4 ? 0 : hn - 4;
		break;
	case 1:
		hn = hn < 2 ? 0 : hn - 2;
		break;
	default:
		return -1;
	}
	return static_cast<::std::int64_t>(hn);
}

inline ::std::uint32_t hex_val(char c) noexcept
{
	if (c >= '0' && c <= '9')
	{
		return static_cast<::std::uint32_t>(c - '0');
	}
	if (c >= 'a' && c <= 'f')
	{
		return static_cast<::std::uint32_t>(c - 'a' + 10);
	}
	if (c >= 'A' && c <= 'F')
	{
		return static_cast<::std::uint32_t>(c - 'A' + 10);
	}
	return 0xffffffffu;
}

template <typename Context>
inline void hmac(::std::byte const *key, ::std::size_t key_len, ::std::byte const *msg,
				 ::std::size_t msg_len, ::std::byte *digest) noexcept
{
	constexpr ::std::size_t block_size{Context{}.digest_size > 32 ? 128 : 64};
	::std::byte key_block[block_size]{};
	if (key_len > block_size)
	{
		Context key_hash;
		key_hash.update(key, key + key_len);
		key_hash.do_final();
		key_hash.digest_to_byte_ptr(key_block);
	}
	else
	{
		for (::std::size_t i{}; i != key_len; ++i)
		{
			key_block[i] = key[i];
		}
	}

	::std::byte pad[block_size];
	for (::std::size_t i{}; i != block_size; ++i)
	{
		pad[i] = key_block[i] ^ ::std::byte{0x36};
	}
	Context inner;
	inner.update(pad, pad + block_size);
	inner.update(msg, msg + msg_len);
	inner.do_final();
	::std::byte inner_digest[Context::digest_size];
	inner.digest_to_byte_ptr(inner_digest);

	for (::std::size_t i{}; i != block_size; ++i)
	{
		pad[i] = key_block[i] ^ ::std::byte{0x5c};
	}
	Context outer;
	outer.update(pad, pad + block_size);
	outer.update(inner_digest, inner_digest + Context::digest_size);
	outer.do_final();
	outer.digest_to_byte_ptr(digest);
}

// KeyUtilities.base26 — Steam's 5-char code alphabet.
inline ::std::size_t base26(::std::uint_least32_t num, char *out) noexcept
{
	constexpr char chars[] = "23456789BCDFGHJKMNPQRTVWXY";
	constexpr ::std::size_t len{5};
	for (::std::size_t i{}; i != len; ++i)
	{
		out[i] = chars[num % 26];
		num /= 26;
	}
	return len;
}

} // namespace

extern "C"
{

	[[__gnu__::__visibility__("default")]]
	::std::byte *otp_input() noexcept
	{
		return input_buffer;
	}

	[[__gnu__::__visibility__("default")]]
	char *otp_output() noexcept
	{
		return output_buffer;
	}

	// Returns the code length in output_buffer, or a negative error code:
	//   -1 invalid base32 padding
	//   -2 invalid base32 character
	//   -3 empty/oversized key
	[[__gnu__::__visibility__("default")]]
	::std::int32_t
	otp_generate(::std::uint32_t type, ::std::uint32_t secret_len, ::std::uint64_t counter,
				 ::std::uint32_t digits, ::std::uint32_t algorithm) noexcept
	{
		if (secret_len > max_secret_size)
		{
			return -3;
		}
		if (digits == 0)
		{
			digits = 6;
		}

		char const *secret = reinterpret_cast<char const *>(input_buffer);
		char hex[max_hex_size];
		::std::int64_t hex_len{};

		switch (static_cast<otp_type>(type))
		{
		case otp_type::hex:
		case otp_type::hhex:
			if (secret_len > max_hex_size)
			{
				return -3;
			}
			for (::std::size_t i{}; i != secret_len; ++i)
			{
				hex[i] = secret[i];
			}
			hex_len = static_cast<::std::int64_t>(secret_len);
			break;
		case otp_type::battle:
			digits = 8;
			[[fallthrough]];
		case otp_type::steam:
			if (static_cast<otp_type>(type) == otp_type::steam)
			{
				digits = 10;
			}
			[[fallthrough]];
		default:
			hex_len = base32_to_hex(secret, secret_len, hex);
			if (hex_len < 0)
			{
				return static_cast<::std::int32_t>(hex_len);
			}
			break;
		}

		// Same odd-length fixup as the JS implementation.
		if (hex_len % 2 == 1)
		{
			if (hex[hex_len - 1] == '0')
			{
				--hex_len;
			}
			else
			{
				hex[hex_len++] = '0';
			}
		}

		if (hex_len <= 0)
		{
			return -3;
		}

		::std::byte key[max_hex_size / 2];
		::std::size_t key_len = static_cast<::std::size_t>(hex_len) / 2;
		for (::std::size_t i{}; i != key_len; ++i)
		{
			::std::uint32_t hi = hex_val(hex[i * 2]);
			::std::uint32_t lo = hex_val(hex[i * 2 + 1]);
			if (hi == 0xffffffffu || lo == 0xffffffffu)
			{
				return -3;
			}
			key[i] = static_cast<::std::byte>((hi << 4) | lo);
		}

		// 8-byte big-endian counter.
		::std::byte msg[8];
		for (int i = 7; i >= 0; --i)
		{
			msg[i] = static_cast<::std::byte>(counter & 0xff);
			counter >>= 8;
		}

		::std::byte digest[64];
		::std::size_t digest_len{};
		switch (static_cast<otp_algorithm>(algorithm))
		{
		case otp_algorithm::sha256:
			hmac<::fast_io::sha256_context>(key, key_len, msg, sizeof(msg), digest);
			digest_len = ::fast_io::sha256_context::digest_size;
			break;
		case otp_algorithm::sha512:
			hmac<::fast_io::sha512_context>(key, key_len, msg, sizeof(msg), digest);
			digest_len = ::fast_io::sha512_context::digest_size;
			break;
		default:
			hmac<::fast_io::sha1_context>(key, key_len, msg, sizeof(msg), digest);
			digest_len = ::fast_io::sha1_context::digest_size;
			break;
		}

		// RFC 4226 dynamic truncation.
		::std::size_t const offset =
			static_cast<::std::size_t>(digest[digest_len - 1]) & 0x0f;
		::std::uint_least32_t code_int =
			((static_cast<::std::uint_least32_t>(digest[offset]) & 0x7f) << 24) |
			(static_cast<::std::uint_least32_t>(digest[offset + 1]) << 16) |
			(static_cast<::std::uint_least32_t>(digest[offset + 2]) << 8) |
			static_cast<::std::uint_least32_t>(digest[offset + 3]);

		if (static_cast<otp_type>(type) == otp_type::steam)
		{
			return static_cast<::std::int32_t>(base26(code_int, output_buffer));
		}

		// Decimal code, last `digits` digits zero-padded.
		char digits_buf[16];
		::std::size_t dn{};
		::std::uint_least32_t v = code_int;
		do
		{
			digits_buf[dn++] = static_cast<char>('0' + v % 10);
			v /= 10;
		} while (v != 0 && dn < sizeof(digits_buf));
		while (dn < digits)
		{
			digits_buf[dn++] = '0';
		}
		if (dn > digits)
		{
			dn = digits;
		}
		for (::std::size_t i{}; i != dn; ++i)
		{
			output_buffer[i] = digits_buf[dn - 1 - i];
		}
		return static_cast<::std::int32_t>(dn);
	}

} // extern "C"
