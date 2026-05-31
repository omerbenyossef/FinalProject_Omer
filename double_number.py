def double_number():
    number = float(input("הכנס מספר: "))
    result = number * 3
    return result


if __name__ == "__main__":
    result = double_number()
    print(f"התוצאה: {result}")
